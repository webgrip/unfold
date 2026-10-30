import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { Store } from '../src/store.ts';
import { JobQueue, backoff } from '../src/jobs/queue.ts';
import { JobWorker, type JobOutcome } from '../src/jobs/worker.ts';

function scratch(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), 'unfold-jobs-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'unfold.sqlite');
}
const start = Date.parse('2026-10-30T10:00:00Z');

test('backoff grows exponentially, stays under its cap and spreads by jitter', () => {
  const policy = { baseMs: 1_000, maxMs: 10_000, factor: 2, jitter: 0.1 };
  assert.deepEqual([1, 2, 3, 4, 5, 9].map(attempts => backoff(attempts, policy, () => 0.5)), [1_000, 2_000, 4_000, 8_000, 10_000, 10_000]);
  assert.equal(backoff(1, policy, () => 0), 900);
  assert.equal(backoff(1, policy, () => 1), 1_100);
});

test('enqueue is idempotent per kind and key; when_finished starts the key again only after the job finished', t => {
  const store = new Store(scratch(t));
  t.after(() => store.close());
  const queue = new JobQueue(store, start);
  assert.equal(queue.enqueue('mail', 'a', { n: 1 }, start).queued, true);
  assert.equal(queue.enqueue('mail', 'a', { n: 2 }, start).queued, false, 'the same key is kept');
  assert.equal(queue.enqueue('other', 'a', { n: 1 }, start).queued, true, 'keys belong to their kind');
  assert.deepEqual(queue.get('mail', 'a')!.payload, { n: 1 });
  const [job] = queue.lease('mail', start, 5);
  assert.equal(queue.enqueue('mail', 'a', { n: 3 }, start, { repeat: 'when_finished' }).queued, false, 'a running job coalesces');
  assert.ok(queue.complete(job, start));
  assert.equal(queue.enqueue('mail', 'a', { n: 4 }, start).queued, false, 'never repeats by default');
  assert.equal(queue.enqueue('mail', 'a', { n: 5 }, start, { repeat: 'when_finished' }).queued, true);
  assert.deepEqual([queue.get('mail', 'a')!.state, queue.get('mail', 'a')!.payload, queue.get('mail', 'a')!.attempts], ['pending', { n: 5 }, 0]);
});

test('a lease hides a job until its visibility timeout, and an expired lease puts it back so another attempt resumes it', t => {
  const store = new Store(scratch(t));
  t.after(() => store.close());
  const queue = new JobQueue(store, start);
  queue.enqueue('hook', 'k', {}, start);
  const [first] = queue.lease('hook', start, 5, 60_000);
  assert.equal(first.attempts, 1);
  assert.equal(queue.lease('hook', start + 59_999, 5, 60_000).length, 0, 'leased jobs stay hidden');
  const [again] = queue.lease('hook', start + 60_000, 5, 60_000);
  assert.equal(again.id, first.id, 'the lease ran out and the job came back');
  assert.equal(again.attempts, 2);
  assert.equal(queue.complete(first, start + 60_001), false, 'the worker that lost the lease cannot settle the job');
  assert.equal(queue.complete(again, start + 60_001), true);
  assert.equal(queue.get('hook', 'k')!.state, 'done');
});

test('a restart takes over the leases of the stopped process: at-least-once work resumes, at-most-once work is dead', t => {
  const path = scratch(t);
  const key = randomBytes(32);
  let store = new Store(path, { key });
  let queue = new JobQueue(store, start);
  queue.enqueue('hook', 'resumes', {}, start);
  queue.enqueue('bill', 'never-twice', {}, start, { guarantee: 'at_most_once' });
  assert.equal(queue.lease('hook', start, 5).length, 1);
  assert.equal(queue.lease('bill', start, 5).length, 1);
  store.close();
  store = new Store(path, { key });
  t.after(() => store.close());
  queue = new JobQueue(store, start + 1_000);
  assert.equal(queue.get('hook', 'resumes')!.state, 'pending');
  const bill = queue.get('bill', 'never-twice')!;
  assert.equal(bill.state, 'dead');
  assert.match(bill.lastError!, /lease_lost/);
  assert.equal(queue.lease('hook', start + 1_000, 5).length, 1, 'the new process picks it up straight away');
});

test('the worker retries with backoff, then dead-letters after the last attempt; an operator can send it again', async t => {
  const store = new Store(scratch(t));
  t.after(() => store.close());
  const now = { value: start };
  const queue = new JobQueue(store, now.value);
  const logged: string[] = [];
  const worker = new JobWorker(queue, { clock: () => now.value, random: () => 0.5, log: (_level, event) => logged.push(event) });
  let calls = 0;
  worker.register({ kind: 'flaky', backoff: { baseMs: 1_000, maxMs: 60_000, jitter: 0 }, run: async () => { calls++; throw new Error('receiver down'); } });
  queue.enqueue('flaky', 'one', {}, now.value, { maxAttempts: 3 });
  assert.equal(await worker.drain('flaky'), 1);
  assert.equal(queue.get('flaky', 'one')!.runAt, new Date(start + 1_000).toISOString());
  assert.equal(await worker.drain('flaky'), 0, 'nothing runs before its time');
  now.value += 1_000;
  assert.equal(await worker.drain('flaky'), 1);
  assert.equal(queue.get('flaky', 'one')!.runAt, new Date(start + 3_000).toISOString(), 'the second wait doubles');
  now.value += 2_000;
  assert.equal(await worker.drain('flaky'), 1);
  const dead = queue.get('flaky', 'one')!;
  assert.deepEqual([dead.state, dead.attempts, dead.lastError, calls], ['dead', 3, 'receiver down', 3]);
  assert.deepEqual(logged, ['job.dead']);
  assert.deepEqual(queue.summary(), [{ kind: 'flaky', pending: 0, running: 0, done: 0, dead: 1, oldestDueAt: null }]);
  const [view] = queue.troubled(10);
  assert.equal(view.state, 'dead');
  assert.equal('payload' in view || 'key' in view, false, 'the operator view leaves out key and payload');
  assert.ok(queue.resend('flaky', 'one', now.value));
  assert.deepEqual([queue.get('flaky', 'one')!.state, queue.get('flaky', 'one')!.attempts], ['pending', 0]);
});

test('the worker honours done, dead, later and an explicit wait, and runs one drain per kind at a time', async t => {
  const store = new Store(scratch(t));
  t.after(() => store.close());
  const now = { value: start };
  const queue = new JobQueue(store, now.value);
  const worker = new JobWorker(queue, { clock: () => now.value, log: () => {} });
  const outcomes: Record<string, JobOutcome> = { a: { done: true }, b: { dead: 'refused' }, c: { later: start + 10_000 }, d: { retry: 'busy', afterMs: 7_000 } };
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  worker.register<{ name: string }>({ kind: 'mixed', concurrency: 4, run: async job => { await gate; return outcomes[job.payload.name]; } });
  for (const name of Object.keys(outcomes)) queue.enqueue('mixed', name, { name }, now.value);
  const first = worker.drain('mixed');
  const second = worker.drain('mixed');
  release();
  assert.equal(await second, 0, 'a second drain waits for the first and adds nothing');
  assert.equal(await first, 3, 'later does not count as an attempt');
  assert.deepEqual(['a', 'b', 'c', 'd'].map(key => queue.get('mixed', key)!.state), ['done', 'dead', 'pending', 'pending']);
  assert.equal(queue.get('mixed', 'c')!.attempts, 0, 'later gives the attempt back');
  assert.equal(queue.get('mixed', 'd')!.runAt, new Date(start + 7_000).toISOString());
  assert.equal(queue.prune(start + 1, 'mixed'), 2, 'finished jobs are pruned');
});
