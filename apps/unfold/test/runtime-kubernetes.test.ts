import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { Agent, createServer, request as httpRequest, type IncomingMessage, type RequestOptions } from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { KubernetesClient, startTimeoutDetail, waitFailure } from '../src/runtime/kubernetes.ts';

test('Kubernetes DELETE frames its complete JSON body and preserves a reused connection after an allowed 404', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'unfold-kubernetes-http-'));
  const tokenFile = join(directory, 'token');
  const caFile = join(directory, 'ca.crt');
  await writeFile(tokenFile, 'fixture-token');
  await writeFile(caFile, 'unused-by-http-framing-fixture');
  const received: { method?: string; body: string; length?: string; port?: number }[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      received.push({ method: request.method, body: Buffer.concat(chunks).toString('utf8'), length: request.headers['content-length'], port: request.socket.remotePort });
      response.writeHead(request.method === 'DELETE' ? 404 : 200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(request.method === 'DELETE' ? { kind: 'Status', reason: 'NotFound' } : { kind: 'PodList', items: [] }));
    });
  });
  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  const originalRequest = https.request;
  t.after(async () => {
    https.request = originalRequest;
    syncBuiltinESMExports();
    agent.destroy();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  t.mock.method(https, 'request', (url: URL, options: RequestOptions, callback: (response: IncomingMessage) => void) => {
    const target = new URL(url);
    target.protocol = 'http:';
    return httpRequest(target, { ...options, agent }, callback);
  });
  syncBuiltinESMExports();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as { port: number };
  const client = new KubernetesClient({ apiUrl: `https://127.0.0.1:${address.port}`, tokenFile, caFile });
  const deletion = { gracePeriodSeconds: 20, dryRun: ['All'], reason: 'préparation' };
  assert.equal(await client.request('/api/v1/namespaces/workspaces/pods/old', 'DELETE', deletion, true), undefined);
  assert.deepEqual(await client.request('/api/v1/namespaces/workspaces/pods'), { kind: 'PodList', items: [] });
  assert.equal(received.length, 2);
  assert.equal(received[0].method, 'DELETE');
  assert.equal(received[0].body, JSON.stringify(deletion));
  assert.equal(received[0].length, String(Buffer.byteLength(JSON.stringify(deletion))));
  assert.equal(received[1].method, 'GET');
  assert.equal(received[1].body, '');
  assert.equal(received[0].port, received[1].port);
});

test('a workspace that does not start in time names workspace_start_timeout, the elapsed time and where it went', () => {
  const startedAt = 1_000_000;
  const phases = [{ phase: 'scheduling' as const, at: startedAt }, { phase: 'creating' as const, at: startedAt + 2_000 }, { phase: 'cloning' as const, at: startedAt + 47_500 }, { phase: 'starting' as const, at: startedAt + 60_000 }];
  const detail = startTimeoutDetail(startedAt, 180_000, phases, startedAt + 180_000);
  assert.equal(detail, 'workspace_start_timeout fired after 180000 ms against a limit of 180000 ms (scheduling 2.0 s, creating 45.5 s, cloning 12.5 s, starting 120.0 s)');
  const failure = waitFailure({ phase: 'starting' }, detail);
  assert.equal(failure.category, 'timeout');
  assert.equal(failure.stage, 'workspace');
  assert.equal(failure.detail, `The workspace was still starting when the time limit ran out.\n${detail}`);
});
