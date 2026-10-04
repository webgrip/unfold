import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, adoptRenamedDatabase, renamedDatabaseFiles } from '../src/store.ts';
import { currentSkin, renamedSkins } from '../src/ploeg.ts';

test('an install that kept its database under the former name keeps its data, write-ahead log included', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'unfold-renamed-'));
  try {
    const [former] = renamedDatabaseFiles;
    await writeFile(join(directory, former), 'database');
    await writeFile(join(directory, `${former}-wal`), 'log');
    const target = join(directory, 'unfold.sqlite');
    assert.equal(adoptRenamedDatabase(target), join(directory, former));
    assert.deepEqual([await readFile(target, 'utf8'), await readFile(`${target}-wal`, 'utf8')], ['database', 'log']);
    assert.deepEqual((await readdir(directory)).sort(), ['unfold.sqlite', 'unfold.sqlite-wal']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('an adopted database keeps its encryption key, so secrets written under the former name still open', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'unfold-renamed-'));
  try {
    const former = new Store(join(directory, renamedDatabaseFiles[0]));
    former.setSecret('ahp-token:kept', { label: 'editor' });
    former.db.close();
    const target = join(directory, 'unfold.sqlite');
    adoptRenamedDatabase(target);
    const adopted = new Store(target);
    assert.deepEqual(adopted.getSecret('ahp-token:kept'), { label: 'editor' });
    adopted.db.close();
    assert.ok(!(await readdir(directory)).some(name => name.startsWith(renamedDatabaseFiles[0])), 'no file is left under the former name');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('an existing database is never replaced by a former one, and a fresh install adopts nothing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'unfold-renamed-'));
  try {
    const target = join(directory, 'unfold.sqlite');
    assert.equal(adoptRenamedDatabase(target), null, 'nothing to adopt');
    await writeFile(target, 'current');
    await writeFile(join(directory, renamedDatabaseFiles[0]), 'former');
    assert.equal(adoptRenamedDatabase(target), null);
    assert.equal(await readFile(target, 'utf8'), 'current');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('a skin Ploeg or a saved theme still sends under its former name resolves to the skin that replaced it', () => {
  for (const [former, current] of Object.entries(renamedSkins)) {
    assert.equal(currentSkin(former), current);
  }
  assert.equal(currentSkin('forge'), 'forge');
});
