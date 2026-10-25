import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaledTimeout } from './timeframes.ts';

const appRoot = fileURLToPath(new URL('../', import.meta.url));

function stages(dockerfile: string): { from: string; lines: string[] }[] {
  const found: { from: string; lines: string[] }[] = [];
  for (const line of dockerfile.split('\n')) {
    const from = /^FROM\s+(\S+)/.exec(line);
    if (from) found.push({ from: from[1], lines: [] });
    else found.at(-1)?.lines.push(line);
  }
  return found;
}

test('the image writes its compile cache with the runtime Node build and the runtime user', async () => {
  const dockerfile = await readFile(join(appRoot, 'Dockerfile'), 'utf8');
  const writers = stages(dockerfile).filter(stage => stage.lines.some(line => line.startsWith('RUN') && line.includes("import('/app/src/main.ts')")));
  assert.equal(writers.length, 1);
  const [writer] = writers;
  assert.equal(writer.from, '${NODE_RUNTIME_IMAGE}');
  const run = writer.lines.findIndex(line => line.includes("import('/app/src/main.ts')"));
  assert.ok(writer.lines.slice(0, run).includes('USER node'), 'the cache directory is named after the uid, so it is written as the user that reads it');
  assert.ok(writer.lines.slice(0, run).includes('ENV NODE_COMPILE_CACHE=/app/.node-cache'));
  assert.match(writer.lines[run], /flushCompileCache\(\)/);
  assert.match(writer.lines[run], /throw new Error/);
});

test('importing the entry module loads the application without starting it', async () => {
  const cache = await mkdtemp(join(tmpdir(), 'unfold-compile-cache-'));
  const cwd = await mkdtemp(join(tmpdir(), 'unfold-import-'));
  try {
    const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(join(appRoot, 'src/main.ts'))}); console.log('imported')`], {
      cwd, encoding: 'utf8', timeout: scaledTimeout(60_000),
      env: { PATH: process.env.PATH, HOME: cwd, NODE_COMPILE_CACHE: cache, UNFOLD_DATA_DIR: join(cwd, 'data'), UNFOLD_PORT: '0' },
    });
    assert.equal(imported.status, 0, imported.stderr);
    assert.equal(imported.stdout.trim(), 'imported');
    assert.doesNotMatch(imported.stdout + imported.stderr, /server\.ready/);
    assert.deepEqual(await readdir(cwd), []);
    const [versioned] = await readdir(cache);
    assert.ok((await readdir(join(cache, versioned))).length >= 50);
  } finally {
    await rm(cache, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  }
});
