import test from 'node:test';
import assert from 'node:assert/strict';
import { application, login, request } from './api-support.ts';
import type { Session } from '../src/types.ts';
import { hashPassword } from '../src/auth.ts';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout } from 'node:timers/promises';

test('CodeRabbit HTTP routes require authentication, object ownership, CSRF protection and explicit provider billing', async t => {
  const server = await application('live', config => {
    config.execution = { team: 'delivery' };
    config.ploeg = { url: 'http://127.0.0.1:1', tokenEnv: 'PLOEG_FIXTURE' };
    config.coderabbit = { dailyReviewLimit: 1, repositories: [{ repositoryId: 'order-service', github: 'fixture/orders', base: 'main', region: 'us', security: { keyEnv: 'CR_SECURITY_FIXTURE', repositoryId: '1', organizationId: '2' } }] };
  });
  t.after(() => server.close());
  const { cookie, user } = await login(server.url);
  const id = 'coderabbit-http';
  server.app.store.saveSession({ id, ownerId: user.id, repositoryId: 'order-service', status: 'completed', runs: [], artifacts: [], execution: { id: 'execution' }, updatedAt: new Date().toISOString() } as unknown as Session);
  const path = `/api/sessions/${id}/coderabbit`;
  assert.equal((await request(server.url, path)).status, 401);
  const view = await request(server.url, path, { cookie }); assert.equal(view.status, 200); assert.equal(view.body.securityEnabled, true);
  assert(!view.text.includes('CR_SECURITY_FIXTURE'));
  assert.equal((await request(server.url, path + '/review', { cookie, method: 'POST', csrf: false })).status, 403);
  assert.equal((await request(server.url, path + '/review', { cookie, method: 'POST', body: { headSha: 'a'.repeat(40) } })).status, 400);
  assert.equal((await request(server.url, path + '/cancel', { cookie, method: 'POST', body: { requestId: '../../another' } })).status, 400);
  assert.equal((await request(server.url, '/api/sessions/missing/coderabbit', { cookie })).status, 404);
  const snapshot = server.app.store.getSession(id)!; snapshot.ownerId = 'another-person'; server.app.store.saveSession(snapshot);
  server.app.store.addUser({ id: 'fixture-operator', name: 'fixture-operator', role: 'operator', passwordHash: hashPassword('fixture-password-123') });
  const operatorLogin = await login(server.url, 'fixture-operator', 'fixture-password-123');
  assert.equal((await request(server.url, path, { cookie: operatorLogin.cookie })).status, 404);
});

test('an HTTP review request reaches the pinned headless CLI and its saved evidence survives restart', async t => {
  const root = await mkdtemp(join(tmpdir(), 'coderabbit-http-')); const binary = join(root, 'coderabbit');
  const sha = 'a'.repeat(40);
  const events = [{ type: 'review_context', remote: 'fixture/orders', currentBranch: sha, baseBranch: 'main' }, { type: 'complete', status: 'review_completed', findings: 0 }];
  const source = `#!${process.execPath}\nif(process.argv[2] === 'auth') process.exit(0); process.stdout.write(${JSON.stringify(events.map(event => JSON.stringify(event)).join('\n') + '\n')});\n`;
  await writeFile(binary, source, { mode: 0o700 });
  process.env.CR_HTTP_REVIEW = 'fixture-headless-review-key';
  t.after(async () => { delete process.env.CR_HTTP_REVIEW; await rm(root, { recursive: true, force: true }); });
  const server = await application('live', config => {
    config.execution = { team: 'delivery' }; config.ploeg = { url: 'http://127.0.0.1:1', tokenEnv: 'PLOEG_FIXTURE' };
    config.coderabbit = { dailyReviewLimit: 1, cli: { binary, sha256: createHash('sha256').update(source).digest('hex'), timeoutMs: 1200000 }, repositories: [{ repositoryId: 'order-service', github: 'fixture/orders', base: 'main', region: 'us', agenticKeyEnv: 'CR_HTTP_REVIEW' }] };
  });
  t.after(() => server.close());
  const { cookie, user } = await login(server.url); const id = 'review-cli-http';
  server.app.store.saveSession({ id, ownerId: user.id, repositoryId: 'order-service', status: 'completed', runs: [], artifacts: [], execution: { id: 'execution' }, updatedAt: new Date().toISOString() } as unknown as Session);
  const path = `/api/sessions/${id}/coderabbit`;
  const payload = { requestId: 'request-http-00001', headSha: sha, acceptProviderBilling: true };
  const started = await request(server.url, path + '/review', { cookie, method: 'POST', body: payload }); assert.equal(started.status, 202, started.text);
  let view = started; const deadline = Date.now() + 5000;
  while (view.body.reviews[0].state === 'running' && Date.now() < deadline) { await setTimeout(20); view = await request(server.url, path, { cookie }); }
  assert.equal(view.body.reviews[0].state, 'completed', view.text);
  await server.restart();
  const saved = await request(server.url, path + '/review/' + payload.requestId, { cookie });
  assert.equal(saved.status, 200, saved.text); assert.equal(saved.body.state, 'completed'); assert.equal(saved.body.costStatus, 'unknown');
  const replay = await request(server.url, path + '/review', { cookie, method: 'POST', body: payload }); assert.equal(replay.status, 202, replay.text);
  assert.equal(server.app.store.events(id).filter(event => event.type === 'coderabbit.review_requested').length, 1);
});
