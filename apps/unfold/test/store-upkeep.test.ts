import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.ts';
import { StoreUpkeep, optimizeEveryMs, quickCheckEveryMs, quickCheckStateId } from '../src/store-upkeep.ts';
import { InsightService } from '../src/insight.ts';
import type { ErrorContext, ErrorReports } from '../src/error-reports.ts';
import type { AppConfig } from '../src/types.ts';

async function withStore(run: (store: Store, path: string) => void | Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'unfold-store-'));
  const path = join(dir, 'unfold.sqlite');
  const store = new Store(path);
  try { await run(store, path); }
  finally { store.close(); await rm(dir, { recursive: true, force: true }); }
}

function recordingErrors() {
  const captured: { error: unknown; context?: ErrorContext }[] = [];
  const errors: ErrorReports = { capture(error, context) { captured.push({ error, context }); }, message() {} };
  return { errors, captured };
}

function quiet<T>(run: () => T): { value: T; logged: string[] } {
  const logged: string[] = [];
  const log = console.log, error = console.error;
  console.log = (line: string) => { logged.push(line); };
  console.error = (line: string) => { logged.push(line); };
  try { return { value: run(), logged }; }
  finally { console.log = log; console.error = error; }
}

test('the database commits in WAL mode with synchronous=NORMAL', async () => {
  await withStore(store => {
    assert.equal(store.db.prepare('PRAGMA journal_mode').get()!.journal_mode, 'wal');
    assert.equal(store.db.prepare('PRAGMA synchronous').get()!.synchronous, 1);
  });
});

test('opening the database analyzes tables whose statistics are missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'unfold-store-'));
  const path = join(dir, 'unfold.sqlite');
  try {
    const store = new Store(path);
    store.db.exec("INSERT INTO sessions(id, owner_id, updated_at, body) VALUES('s', 'u', 't', '{}')");
    const insert = store.db.prepare("INSERT INTO events(session_id, type, at, actor, data) VALUES('s', 'x', 't', 'a', '{}')");
    store.db.exec('BEGIN');
    for (let i = 0; i < 2000; i++) insert.run();
    store.db.exec('COMMIT');
    store.db.exec('DROP TABLE IF EXISTS sqlite_stat1');
    store.close();
    const reopened = new Store(path);
    try { assert.ok((reopened.db.prepare("SELECT count(*) AS n FROM sqlite_stat1 WHERE tbl = 'events'").get()!.n as number) > 0); }
    finally { reopened.close(); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('an intact database passes quick_check', async () => {
  await withStore(store => { assert.deepEqual(store.quickCheck(), []); });
});

test('the store is not checked at boot', async () => {
  await withStore(store => { assert.equal(store.getSecret(quickCheckStateId), undefined); });
});

test('upkeep refreshes planner statistics every four hours, not on every tick', () => {
  let now = 0, optimized = 0;
  const state = new Map<string, unknown>([[quickCheckStateId, { at: 0, ok: true }]]);
  const store = { optimize() { optimized++; }, quickCheck: () => [], getSecret: <T>(id: string) => state.get(id) as T | undefined, setSecret(id: string, value: unknown) { state.set(id, value); } };
  const upkeep = new StoreUpkeep(store, recordingErrors().errors, () => now);
  now = optimizeEveryMs - 1; upkeep.run();
  assert.equal(optimized, 0);
  now = optimizeEveryMs; upkeep.run();
  assert.equal(optimized, 1);
  now = optimizeEveryMs + 3_600_000; upkeep.run();
  assert.equal(optimized, 1);
  now = 2 * optimizeEveryMs; upkeep.run();
  assert.equal(optimized, 2);
});

test('upkeep runs quick_check once a day, on the first tick when no check is recorded, and survives a restart', async () => {
  await withStore(store => {
    let checks = 0;
    const counted = Object.assign(Object.create(store) as Store, { quickCheck: () => { checks++; return store.quickCheck(); } });
    let now = 1_000_000;
    const { errors, captured } = recordingErrors();
    const { logged } = quiet(() => new StoreUpkeep(counted, errors, () => now).run());
    assert.equal(checks, 1);
    assert.deepEqual(store.getSecret(quickCheckStateId), { at: 1_000_000, ok: true });
    assert.match(logged[0], /"event":"store.quick_check","ok":true/);
    const restarted = new StoreUpkeep(counted, errors, () => now);
    now += quickCheckEveryMs - 1;
    quiet(() => restarted.run());
    assert.equal(checks, 1, 'a restart does not repeat a check made within the day');
    now += 1;
    quiet(() => restarted.run());
    assert.equal(checks, 2);
    assert.equal(captured.length, 0);
  });
});

test('a failing quick_check is logged and reported as fatal, and checked again the next day', () => {
  let now = 0;
  const state = new Map<string, unknown>();
  const store = { optimize() {}, quickCheck: () => ['row 3 missing from index events_session', 'wrong # of entries in index events_session'], getSecret: <T>(id: string) => state.get(id) as T | undefined, setSecret(id: string, value: unknown) { state.set(id, value); } };
  const { errors, captured } = recordingErrors();
  const upkeep = new StoreUpkeep(store, errors, () => now);
  const { logged } = quiet(() => upkeep.run());
  const line = JSON.parse(logged[0]);
  assert.equal(line.level, 'error');
  assert.equal(line.event, 'store.quick_check');
  assert.equal(line.ok, false);
  assert.deepEqual(line.problems, ['row 3 missing from index events_session', 'wrong # of entries in index events_session']);
  assert.equal(captured.length, 1);
  assert.match(String((captured[0].error as Error).message), /quick_check found 2 problem\(s\): row 3 missing/);
  assert.equal(captured[0].context?.level, 'fatal');
  assert.deepEqual(captured[0].context?.tags, { feature: 'store', check: 'quick_check' });
  assert.deepEqual(state.get(quickCheckStateId), { at: 0, ok: false });
  now = quickCheckEveryMs;
  quiet(() => upkeep.run());
  assert.equal(captured.length, 2);
});

test('a quick_check that throws, as SQLite does on a damaged file, is reported too', () => {
  const store = { optimize() {}, quickCheck: (): string[] => { throw new Error('database disk image is malformed'); }, getSecret: () => undefined, setSecret() {} };
  const { errors, captured } = recordingErrors();
  quiet(() => new StoreUpkeep(store, errors, () => 0).run());
  assert.equal(captured.length, 1);
  assert.match(String((captured[0].error as Error).message), /malformed/);
});

test('the hourly insight maintenance runs the store upkeep', async () => {
  await withStore(async store => {
    let ran = 0;
    const insight = new InsightService(store, { productEvents: true } as unknown as AppConfig, '9.9.9', () => new Date(0), { schedule: false, upkeep: () => { ran++; } });
    await insight.maintain();
    assert.equal(ran, 1);
    insight.stop();
  });
});

test('an upkeep failure does not stop the insight maintenance', async () => {
  await withStore(async store => {
    const insight = new InsightService(store, { productEvents: true } as unknown as AppConfig, '9.9.9', () => new Date(0), { schedule: false, upkeep: () => { throw new Error('disk I/O error'); } });
    const { logged } = await (async () => { const lines: string[] = []; const error = console.error; console.error = (line: string) => { lines.push(line); }; try { await insight.maintain(); } finally { console.error = error; } return { logged: lines }; })();
    assert.match(logged[0], /store.upkeep_failed/);
    assert.ok(store.getSecret('insight:export'), 'the product-event fold still ran');
    insight.stop();
  });
});
