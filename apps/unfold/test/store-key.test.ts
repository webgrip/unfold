import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Store, storeKeyFromEnvironment } from '../src/store.ts';

async function databasePath(t: test.TestContext): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'unfold-store-key-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return join(dir, 'unfold.sqlite');
}

test('without a supplied key the store keeps its key in a file next to the database', async t => {
  const path = await databasePath(t);
  const store = new Store(path);
  store.setSecret('link:gitlab:alice', { accessToken: 'secret' });
  store.close();
  assert.equal(readFileSync(`${path}.key`).length, 32);
  const reopened = new Store(path);
  t.after(() => reopened.close());
  assert.deepEqual(reopened.getSecret('link:gitlab:alice'), { accessToken: 'secret' });
});

test('a supplied key reseals the internal state the key file opened, then removes the key file', async t => {
  const path = await databasePath(t);
  const legacy = new Store(path);
  legacy.setSecret('link:gitlab:alice', { accessToken: 'secret' });
  legacy.setSecret('relay:session-1', { digest: 'a'.repeat(64) });
  legacy.close();
  const key = randomBytes(32);
  const adopted = new Store(path, { key });
  assert.equal(existsSync(`${path}.key`), false, 'the key no longer sits on the database volume');
  assert.deepEqual(adopted.getSecret('link:gitlab:alice'), { accessToken: 'secret' });
  adopted.close();
  const restarted = new Store(path, { key });
  t.after(() => restarted.close());
  assert.deepEqual(restarted.getSecret('relay:session-1'), { digest: 'a'.repeat(64) });
  assert.equal(existsSync(`${path}.key`), false, 'a restart with the key creates no new key file');
});

test('supplying the key file\'s own bytes keeps every row as it is and removes the file', async t => {
  const path = await databasePath(t);
  const legacy = new Store(path);
  legacy.setSecret('link:clickup:bob', { accessToken: 'pk_1' });
  legacy.close();
  const key = readFileSync(`${path}.key`);
  const store = new Store(path, { key });
  t.after(() => store.close());
  assert.equal(existsSync(`${path}.key`), false);
  assert.deepEqual(store.getSecret('link:clickup:bob'), { accessToken: 'pk_1' });
});

test('a supplied key that opens nothing stops the start and leaves the key file in place', async t => {
  const path = await databasePath(t);
  const first = new Store(path, { key: randomBytes(32) });
  first.setSecret('link:gitlab:alice', { accessToken: 'secret' });
  first.close();
  assert.throws(() => new Store(path, { key: randomBytes(32) }), /UNFOLD_STORE_KEY does not open the stored internal state/);
  const wrongFile = new Store(path);
  wrongFile.close();
  assert.throws(() => new Store(path, { key: randomBytes(32) }), /and neither does the key file/);
  assert.equal(existsSync(`${path}.key`), true, 'a refused start removes nothing');
});

test('UNFOLD_STORE_KEY takes 32 bytes as base64, base64url or hex and refuses anything else', () => {
  const key = randomBytes(32);
  assert.equal(storeKeyFromEnvironment({}), undefined);
  assert.deepEqual(storeKeyFromEnvironment({ UNFOLD_STORE_KEY: key.toString('base64') }), key);
  assert.deepEqual(storeKeyFromEnvironment({ UNFOLD_STORE_KEY: key.toString('base64url') }), key);
  assert.deepEqual(storeKeyFromEnvironment({ UNFOLD_STORE_KEY: key.toString('hex') }), key);
  assert.throws(() => storeKeyFromEnvironment({ UNFOLD_STORE_KEY: randomBytes(16).toString('base64') }), /32 bytes/);
  assert.throws(() => storeKeyFromEnvironment({ UNFOLD_STORE_KEY: 'not-a-key' }), /32 bytes/);
});

test('the chart hands the workbench its store key from a named Secret', { skip: spawnSync('helm', ['version'], { stdio: 'ignore' }).status !== 0 && 'helm is unavailable' }, () => {
  const chart = fileURLToPath(new URL('../ops/helm/unfold', import.meta.url));
  const render = (...sets: string[]) => spawnSync('helm', ['template', 'unfold', chart, '--set', 'ploeg.enabled=false', '--set', 'mode=live', ...sets.flatMap(set => ['--set', set])], { encoding: 'utf8' });
  const keyed = render('storeKey.existingSecret=unfold-store', 'storeKey.secretKey=store-key');
  assert.equal(keyed.status, 0, keyed.stderr);
  assert.match(keyed.stdout, /- name: UNFOLD_STORE_KEY\n\s+valueFrom:\n\s+secretKeyRef:\n\s+name: unfold-store\n\s+key: store-key/);
  assert.doesNotMatch(render().stdout, /UNFOLD_STORE_KEY/);
});
