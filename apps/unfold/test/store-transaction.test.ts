import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.ts';

test('a transaction SQLite already rolled back rethrows the error that ended it, not a failed rollback', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'unfold-store-'));
  const store = new Store(join(dir, 'unfold.sqlite'));
  t.after(async () => { store.close(); await rm(dir, { recursive: true, force: true }); });
  const cause = new Error('disk I/O error');
  assert.throws(() => store.transaction(() => { store.db.exec('ROLLBACK'); throw cause; }), error => error === cause);
  assert.equal(store.db.isTransaction, false);
  assert.equal(store.transaction(() => 'next'), 'next', 'the store takes the next transaction');
});
