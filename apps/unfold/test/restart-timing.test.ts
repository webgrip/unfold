import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { request } from 'node:http';
import { connect } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeWithin } from '../src/main.ts';
import { keepAliveTimeoutMs } from '../src/http.ts';
import { application } from './api-support.ts';
import { scaledTimeout } from './timeframes.ts';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const helmMissing = spawnSync('helm', ['version'], { stdio: 'ignore' }).status !== 0 && 'helm is unavailable';

function workbenchContainer(): string {
  const rendered = spawnSync('helm', ['template', 'unfold', join(appRoot, 'ops/helm/unfold'), '--namespace', 'unfold', '--set', 'ploeg.enabled=false'], { encoding: 'utf8' });
  assert.equal(rendered.status, 0, rendered.stderr);
  return /kind: Deployment\n[\s\S]*?name: unfold\n[\s\S]*?(?=\n---|$)/.exec(rendered.stdout)![0];
}

function probe(deployment: string, name: string): string {
  return new RegExp(`${name}:\\n[\\s\\S]*?(?=\\n\\s+[a-zA-Z]+Probe:|\\n\\s+resources:)`).exec(deployment)![0];
}

test('the chart probes every second and gives shutdown 20 seconds, with no preStop sleep', { skip: helmMissing }, () => {
  const deployment = workbenchContainer();
  assert.match(deployment, /terminationGracePeriodSeconds: 20\n/);
  assert.match(deployment, /strategy:\n\s+type: Recreate/);
  assert.match(deployment, /replicas: 1\n/);
  assert.doesNotMatch(deployment, /preStop/);
  const startup = probe(deployment, 'startupProbe');
  assert.match(startup, /path: \/healthz/);
  assert.match(startup, /periodSeconds: 1\n/);
  assert.match(startup, /failureThreshold: 60/);
  const readiness = probe(deployment, 'readinessProbe');
  assert.match(readiness, /path: \/readyz/);
  assert.match(readiness, /periodSeconds: 1\n/);
  assert.match(readiness, /failureThreshold: 3/);
  assert.match(probe(deployment, 'livenessProbe'), /path: \/healthz[\s\S]*periodSeconds: 20/);
});

test('the server keeps idle keep-alive connections for 75 seconds and still bounds slow headers', async () => {
  const workbench = await application();
  try {
    assert.equal(keepAliveTimeoutMs, 75_000);
    assert.equal(workbench.app.server.keepAliveTimeout, 75_000);
    assert.equal(workbench.app.server.headersTimeout, 10_000);
    const header = await new Promise<string | undefined>((resolve, reject) => {
      const req = request(`${workbench.url}/healthz`, { headers: { connection: 'keep-alive' } }, res => { res.resume(); res.on('end', () => resolve(String(res.headers['keep-alive']))); });
      req.on('error', reject);
      req.end();
    });
    assert.equal(header, 'timeout=75');
  } finally {
    await workbench.close();
  }
});

test('closing the server does not wait out the keep-alive of a connection whose request finished after the close began', async () => {
  const workbench = await application();
  const { port } = new URL(workbench.url);
  const socket = connect(Number(port), '127.0.0.1');
  await once(socket, 'connect');
  socket.write('GET /healthz HTTP/1.1\r\nHost: 127.0.0.1\r\n');
  const answered = new Promise<void>(resolve => socket.on('data', chunk => { if (String(chunk).startsWith('HTTP/1.1 200')) resolve(); }));
  await delay(50);
  const started = performance.now();
  const closed = workbench.close();
  socket.write('Connection: keep-alive\r\n\r\n');
  await answered;
  await closed;
  socket.destroy();
  assert.ok(performance.now() - started < scaledTimeout(5_000), `close took ${Math.round(performance.now() - started)} ms`);
});

test('a shutdown that finishes in time reports closed', async () => {
  assert.equal(await closeWithin(async () => {}, 1_000), 'closed');
});

test('a shutdown that hangs past the deadline reports the deadline instead of waiting', async () => {
  const started = performance.now();
  assert.equal(await closeWithin(() => new Promise<void>(() => {}), 50), 'deadline');
  assert.ok(performance.now() - started < scaledTimeout(1_000));
});

test('a shutdown that fails rejects with its error', async () => {
  await assert.rejects(closeWithin(async () => { throw new Error('store busy'); }, 1_000), /store busy/);
});

test('the server logs how long it took to boot and how many sessions it recovered, and exits cleanly on SIGTERM', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'unfold-boot-'));
  const child = spawn(process.execPath, ['src/main.ts', '--demo'], { cwd: appRoot, env: { PATH: process.env.PATH, HOME: process.env.HOME, UNFOLD_HOST: '127.0.0.1', UNFOLD_PORT: '0', UNFOLD_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const ready = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no server.ready')), scaledTimeout(30_000));
      let buffered = '';
      child.stdout.on('data', chunk => {
        buffered += chunk;
        for (const line of buffered.split('\n')) {
          try { const event = JSON.parse(line); if (event.event === 'server.ready') { clearTimeout(timer); resolve(event); } } catch {}
        }
      });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`exited with ${code} before server.ready`)); });
    });
    assert.equal(typeof ready.bootMs, 'number');
    assert.ok((ready.bootMs as number) > 0);
    assert.equal(ready.recoveredSessions, 0);
    const exited = new Promise<number | null>(resolve => child.once('exit', code => resolve(code)));
    child.kill('SIGTERM');
    assert.equal(await exited, 0);
  } finally {
    child.kill('SIGKILL');
    await rm(dataDir, { recursive: true, force: true });
  }
});
