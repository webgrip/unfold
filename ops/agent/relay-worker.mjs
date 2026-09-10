#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';

const relayUrl = process.env.VLOER_RELAY_URL;
const token = process.env.VLOER_RELAY_TOKEN;
const target = process.env.VLOER_RELAY_TARGET ?? 'http://127.0.0.1:4096';
const separator = process.argv.indexOf('--');
const childArgv = separator >= 0 ? process.argv.slice(separator + 1) : [];
if (!relayUrl || !token) { process.stderr.write('relay-worker: VLOER_RELAY_URL and VLOER_RELAY_TOKEN are required\n'); process.exit(64); }

const log = (message) => process.stderr.write(`${new Date().toISOString()} relay-worker: ${message}\n`);
const authorization = `Bearer ${token}`;
const inFlight = new Map();
let stopping = false;

let child;
if (childArgv.length) {
  child = spawn(childArgv[0], childArgv.slice(1), { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, VLOER_RELAY_TOKEN: '' } });
  child.on('exit', code => { log(`child exited with ${code ?? 'signal'}`); process.exit(code ?? 1); });
}
const stop = () => { if (stopping) return; stopping = true; for (const controller of inFlight.values()) controller.abort(); if (child) child.kill('SIGTERM'); setTimeout(() => process.exit(0), 3000).unref(); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

async function relay(request) {
  const controller = new AbortController();
  inFlight.set(request.id, controller);
  let upstream;
  try {
    const headers = { ...request.headers };
    delete headers.host; delete headers['content-length']; delete headers.connection;
    upstream = await fetch(new URL(request.path, target), { method: request.method, headers, body: request.body ? Buffer.from(request.body, 'base64') : undefined, signal: controller.signal, redirect: 'manual' });
  } catch (error) {
    inFlight.delete(request.id);
    if (controller.signal.aborted) return;
    await fetch(`${relayUrl}/responses/${request.id}`, { method: 'POST', headers: { authorization, 'x-relay-status': '502', 'x-relay-headers': JSON.stringify({ 'content-type': 'text/plain' }) }, body: `relay-worker could not reach ${target}: ${error?.cause?.code ?? error?.name ?? 'error'}` }).catch(() => {});
    return;
  }
  const responseHeaders = {};
  upstream.headers.forEach((value, key) => { if (!/^(content-length|transfer-encoding|connection)$/i.test(key)) responseHeaders[key] = value; });
  const body = upstream.body && upstream.status !== 204 && upstream.status !== 304 ? Readable.fromWeb(upstream.body) : undefined;
  try {
    await fetch(`${relayUrl}/responses/${request.id}`, { method: 'POST', headers: { authorization, 'x-relay-status': String(upstream.status), 'x-relay-headers': JSON.stringify(responseHeaders), 'content-type': 'application/octet-stream' }, body: body ? Readable.toWeb(body) : undefined, duplex: 'half', signal: controller.signal });
  } catch (error) {
    if (!controller.signal.aborted) log(`response relay for ${request.id} ended: ${error?.cause?.code ?? error?.name ?? 'error'}`);
    controller.abort();
    if (body) body.destroy();
  } finally { inFlight.delete(request.id); }
}

async function poll() {
  let failures = 0;
  while (!stopping) {
    try {
      const response = await fetch(`${relayUrl}/requests?wait=25000`, { headers: { authorization }, signal: AbortSignal.timeout(40_000) });
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

log(`relaying ${target} through ${new URL(relayUrl).origin}`);
void poll();
