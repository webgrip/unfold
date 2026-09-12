import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createSession, repositoryRoot, request, sessionUntil } from './api-support.ts';

test('a real server crash recovers an interrupted session without silently executing it again', { timeout: 35_000 }, async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'vloer-process-'));
  let child: ChildProcess | undefined;
  let output = '';
  t.after(async () => {
    if (child?.pid && child.exitCode === null && child.signalCode === null) await kill(child);
    await rm(dataDir, { recursive: true, force: true });
  });
  const launch = async () => {
    const port = await unusedPort();
    const url = `http://127.0.0.1:${port}`;
    output = '';
    child = spawn(process.execPath, ['src/main.ts', '--demo'], {
      cwd: repositoryRoot,
      env: { ...process.env, VLOER_HOST: '127.0.0.1', VLOER_PORT: String(port), VLOER_DATA_DIR: dataDir, VLOER_BASE_URL: url },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    child.stdout?.on('data', chunk => { output = (output + chunk.toString()).slice(-8000); });
    child.stderr?.on('data', chunk => { output = (output + chunk.toString()).slice(-8000); });
    child.on('error', error => { output += error.message; });
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) assert.fail(`server process exited during startup: ${output}`);
      try {
        const health = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(300) });
        if (health.ok) return url;
      } catch {}
      await delay(50);
    }
    assert.fail(`server did not start: ${output}`);
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
  await delay(300);
  const recovered = await request(url, `/api/sessions/${session.id}`);
  assert.equal(recovered.status, 200, recovered.text);
  assert.equal(recovered.body.status, 'interrupted');
  assert(recovered.body.runs.every((run: { status: string }) => run.status !== 'running'));
  const after = await request(url, `/api/sessions/${session.id}/history`);
  assert.equal(after.body.filter((event: { type: string }) => event.type === 'run.started').length, beforeStarts);
  assert(after.body.some((event: { type: string; data: { autoResumed?: boolean } }) => event.type === 'session.interrupted' && event.data.autoResumed === false));
});

async function unusedPort(): Promise<number> {
  const socket = createServer();
  await new Promise<void>((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
  const address = socket.address();
  assert(address && typeof address !== 'string');
  await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  return address.port;
}

async function kill(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
  if (process.platform === 'win32') child.kill('SIGKILL');
  else if (child.pid) process.kill(-child.pid, 'SIGKILL');
  await exited;
}
