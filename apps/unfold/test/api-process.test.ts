import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { scaledTimeout, testTimeout, waitFor } from './timeframes.ts';
import { createSession, repositoryRoot, request, sessionUntil } from './api-support.ts';

test('a real server crash recovers an interrupted session without silently executing it again', { timeout: testTimeout(60_000) }, async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'unfold-process-'));
  let child: ChildProcess | undefined;
  let output = '';
  t.after(async () => {
    if (child?.pid && child.exitCode === null && child.signalCode === null) await kill(child);
    await rm(dataDir, { recursive: true, force: true });
  });
  const launch = async () => {
    output = '';
    child = spawn(process.execPath, ['src/main.ts', '--demo'], {
      cwd: repositoryRoot,
      env: { ...process.env, UNFOLD_HOST: '127.0.0.1', UNFOLD_PORT: '0', UNFOLD_DATA_DIR: dataDir, UNFOLD_BASE_URL: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    const started = child;
    let lines = '';
    const ready = new Promise<string>((resolve, reject) => {
      started.stdout?.on('data', chunk => {
        lines += chunk.toString();
        for (const line of lines.split('\n')) {
          try { const entry = JSON.parse(line); if (entry.event === 'server.ready') resolve(entry.url); } catch {}
        }
      });
      started.once('exit', (code, signal) => reject(new Error(`server process exited during startup (${code ?? signal}): ${output}`)));
      started.once('error', reject);
    });
    child.stdout?.on('data', chunk => { output = (output + chunk.toString()).slice(-8000); });
    child.stderr?.on('data', chunk => { output = (output + chunk.toString()).slice(-8000); });
    const deadline = delay(scaledTimeout(30_000), undefined, { ref: false }).then(() => { throw new Error(`server did not start: ${output}`); });
    const url = await Promise.race([ready, deadline]);
    const health = await fetch(`${url}/healthz`);
    assert.equal(health.status, 200, output);
    return url;
  };

  let url = await launch();
  const session = await createSession(url);
  assert.equal((await request(url, `/api/sessions/${session.id}/start`, { method: 'POST' })).status, 200);
  await sessionUntil(url, session.id, current => current.runs.some(run => run.status === 'running'));
  const before = await request(url, `/api/sessions/${session.id}/history`);
  const beforeStarts = before.body.filter((event: { type: string }) => event.type === 'run.started').length;
  assert.equal(beforeStarts, 1);
  assert(child);
  await kill(child);
  url = await launch();
  const recovered = await waitFor(
    () => request(url, `/api/sessions/${session.id}`),
    result => result.status === 200 && result.body.status === 'interrupted' && result.body.runs.every((run: { status: string }) => run.status !== 'running'),
    { reason: 'restarted server did not reconcile the interrupted session', withinMs: 20_000 },
  );
  assert.equal(recovered.status, 200, recovered.text);
  assert.equal(recovered.body.status, 'interrupted');
  assert(recovered.body.runs.every((run: { status: string }) => run.status !== 'running'));
  const after = await request(url, `/api/sessions/${session.id}/history`);
  assert.equal(after.body.filter((event: { type: string }) => event.type === 'run.started').length, beforeStarts);
  assert(after.body.some((event: { type: string; data: { autoResumed?: boolean } }) => event.type === 'session.interrupted' && event.data.autoResumed === false));
});

async function kill(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
  if (process.platform === 'win32') child.kill('SIGKILL');
  else if (child.pid) process.kill(-child.pid, 'SIGKILL');
  await exited;
}
