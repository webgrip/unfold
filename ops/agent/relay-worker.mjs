#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { createServer } from 'node:http';
import { hostname } from 'node:os';

const target = process.env.VLOER_RELAY_TARGET ?? 'http://127.0.0.1:4096';
const separator = process.argv.indexOf('--');
const childArgv = separator >= 0 ? process.argv.slice(separator + 1) : [];
const log = (message) => process.stderr.write(`${new Date().toISOString()} relay-worker: ${message}\n`);
const inFlight = new Map();
let relayUrl = process.env.VLOER_RELAY_URL;
let token = process.env.VLOER_RELAY_TOKEN;
let sessionEnv = {};
let child;
let stopping = false;

const stop = () => { if (stopping) return; stopping = true; for (const controller of inFlight.values()) controller.abort(); if (child) child.kill('SIGTERM'); setTimeout(() => process.exit(0), 3000).unref(); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

function startChild(argv, extraEnv = {}) {
  const started = spawn(argv[0], argv.slice(1), { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, ...extraEnv, VLOER_RELAY_TOKEN: '', VLOER_POOL_TOKEN: '' } });
  started.on('exit', code => { if (child === started) { log(`child exited with ${code ?? 'signal'}`); if (!stopping && !process.env.VLOER_RELAY_KEEP_ALIVE) process.exit(code ?? 1); child = undefined; } });
  return started;
}

async function stopChild() {
  if (!child) return { stopped: true };
  const current = child;
  child = undefined;
  await new Promise(resolve => { const timer = setTimeout(() => { current.kill('SIGKILL'); resolve(); }, 10_000); current.once('exit', () => { clearTimeout(timer); resolve(); }); current.kill('SIGTERM'); });
  return { stopped: true };
}

async function control(request) {
  const body = request.body ? Buffer.from(request.body, 'base64').toString('utf8') : '';
  if (request.path.startsWith('/__vloer/stop-child')) return { status: 200, body: JSON.stringify(await stopChild()) };
  if (request.path.startsWith('/__vloer/run')) {
    const spec = JSON.parse(body || '{}');
    if (!Array.isArray(spec.argv) || !spec.argv.length) return { status: 400, body: '{"error":"argv required"}' };
    await stopChild();
    child = startChild(spec.argv, { ...sessionEnv, ...(spec.env ?? {}) });
    return { status: 202, body: JSON.stringify({ started: spec.argv[0] }) };
  }
  if (request.path.startsWith('/__vloer/exec')) {
    const spec = JSON.parse(body || '{}');
    if (!Array.isArray(spec.argv) || !spec.argv.length) return { status: 400, body: '{"error":"argv required"}' };
    const result = await new Promise(resolve => {
      let stdout = ''; let stderr = '';
      const run = spawn(spec.argv[0], spec.argv.slice(1), { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...sessionEnv, ...(spec.env ?? {}), VLOER_RELAY_TOKEN: '', VLOER_POOL_TOKEN: '' }, cwd: spec.cwd ?? process.cwd() });
      run.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-65536); });
      run.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-65536); });
      run.on('error', error => resolve({ exitCode: 127, stdout, stderr: `${stderr}\n${error.message}` }));
      run.on('exit', code => resolve({ exitCode: code ?? 1, stdout, stderr }));
    });
    return { status: 200, body: JSON.stringify(result) };
  }
  if (request.path.startsWith('/__vloer/status')) return { status: 200, body: JSON.stringify({ child: Boolean(child), session: sessionEnv.VLOER_SESSION_ID ?? null, inFlight: inFlight.size }) };
  return { status: 404, body: '{"error":"unknown control path"}' };
}

async function respond(request, status, headers, body, signal) {
  await fetch(`${relayUrl}/responses/${request.id}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'x-relay-status': String(status), 'x-relay-headers': JSON.stringify(headers), 'content-type': 'application/octet-stream' }, body, duplex: 'half', signal });
}

async function relay(request) {
  const controller = new AbortController();
  inFlight.set(request.id, controller);
  try {
    if (request.path.startsWith('/__vloer/')) {
      const result = await control(request);
      await respond(request, result.status, { 'content-type': 'application/json' }, result.body, controller.signal);
      return;
    }
    let upstream;
    try {
      const headers = { ...request.headers };
      delete headers.host; delete headers['content-length']; delete headers.connection;
      upstream = await fetch(new URL(request.path, target), { method: request.method, headers, body: request.body ? Buffer.from(request.body, 'base64') : undefined, signal: controller.signal, redirect: 'manual' });
    } catch (error) {
      if (controller.signal.aborted) return;
      await respond(request, 502, { 'content-type': 'text/plain' }, `relay-worker could not reach ${target}: ${error?.cause?.code ?? error?.name ?? 'error'}`).catch(() => {});
      return;
    }
    const responseHeaders = {};
    upstream.headers.forEach((value, key) => { if (!/^(content-length|transfer-encoding|connection)$/i.test(key)) responseHeaders[key] = value; });
    const body = upstream.body && upstream.status !== 204 && upstream.status !== 304 ? Readable.fromWeb(upstream.body) : undefined;
    try { await respond(request, upstream.status, responseHeaders, body ? Readable.toWeb(body) : undefined, controller.signal); }
    catch (error) { if (!controller.signal.aborted) log(`response relay for ${request.id} ended: ${error?.cause?.code ?? error?.name ?? 'error'}`); controller.abort(); if (body) body.destroy(); }
  } finally { inFlight.delete(request.id); }
}

async function poll() {
  let failures = 0;
  while (!stopping) {
    try {
      const response = await fetch(`${relayUrl}/requests?wait=25000`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(40_000) });
      if (response.status === 401 || response.status === 404) { log(`relay refused the worker (HTTP ${response.status}); stopping`); stop(); return; }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const batch = await response.json();
      failures = 0;
      for (const id of batch.cancelled ?? []) inFlight.get(id)?.abort();
      for (const request of batch.requests ?? []) void relay(request);
    } catch (error) {
      failures++;
      if (failures === 1 || failures % 10 === 0) log(`poll failed (${failures}): ${error?.cause?.code ?? error?.name ?? 'error'}`);
      await new Promise(done => setTimeout(done, Math.min(10_000, 500 * failures)));
    }
  }
}

async function bootstrap() {
  const poolUrl = process.env.VLOER_POOL_URL;
  const poolToken = process.env.VLOER_POOL_TOKEN;
  const pod = process.env.VLOER_POD_NAME ?? hostname();
  if (!poolUrl || !poolToken) { log('VLOER_RELAY_URL and VLOER_RELAY_TOKEN, or VLOER_POOL_URL and VLOER_POOL_TOKEN, are required'); process.exit(64); }
  log(`warm worker ${pod} waiting for an assignment from ${new URL(poolUrl).origin}`);
  let failures = 0;
  while (!stopping) {
    try {
      const response = await fetch(`${poolUrl}/claim?pod=${encodeURIComponent(pod)}&wait=25000`, { headers: { authorization: `Bearer ${poolToken}` }, signal: AbortSignal.timeout(40_000) });
      if (response.status === 401) { log('pool token rejected; stopping'); process.exit(65); }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { assignment } = await response.json();
      failures = 0;
      if (!assignment) continue;
      sessionEnv = { ...assignment.env, VLOER_SESSION_ID: assignment.sessionId };
      relayUrl = `${poolUrl.replace(/\/pool$/, '')}/${assignment.sessionId}`;
      token = assignment.token;
      log(`assigned session ${assignment.sessionId}`);
      return;
    } catch (error) {
      failures++;
      if (failures === 1 || failures % 10 === 0) log(`claim failed (${failures}): ${error?.cause?.code ?? error?.name ?? 'error'}`);
      await new Promise(done => setTimeout(done, Math.min(10_000, 500 * failures)));
    }
  }
}

if (!relayUrl || !token) await bootstrap();
if (childArgv.length) child = startChild(childArgv, sessionEnv);
log(`relaying ${target} through ${new URL(relayUrl).origin}`);
void poll();
