import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { application, createInput, createSession, replay, request, sessionUntil } from './api-support.ts';
import type { Event } from '../src/types.ts';

test('HTTP demo produces real failing and passing checks, review evidence, and replayable durable events', { timeout: 35_000 }, async t => {
  const server = await application();
  assert.equal(server.config.ploeg, undefined);
  assert.equal(server.config.execution, undefined);
  t.after(() => server.close());
  const bootstrap = await request(server.url, '/api/bootstrap');
  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrap.body.mode, 'demo');
  assert.equal(typeof bootstrap.body.user.id, 'string');

  const created = await createSession(server.url);
  assert.equal(created.status, 'queued');
  assert.equal(created.costStatus, 'demo');
  const start = await request(server.url, `/api/sessions/${created.id}/start`, { method: 'POST' });
  assert.equal(start.status, 200, start.text);
  const completed = await sessionUntil(server.url, created.id, session => ['completed', 'failed'].includes(session.status));
  assert.equal(completed.status, 'completed', JSON.stringify(completed));
  assert.equal(completed.spentUsd, 0, 'demo must never invent paid model spend');
  assert.equal(completed.costStatus, 'demo');
  assert(completed.runs.some(run => run.mode === 'write' && run.status === 'completed'));
  assert(completed.runs.some(run => run.mode === 'read' && run.status === 'completed' && run.verdict === 'approve'));

  const baseline = completed.artifacts.find(artifact => artifact.name === 'Baseline checks (expected failure)');
  const verification = completed.artifacts.find(artifact => artifact.name === 'Verification checks');
  const review = completed.artifacts.find(artifact => artifact.name === 'Independent review checks');
  const diff = completed.artifacts.find(artifact => artifact.kind === 'diff');
  assert(baseline, 'the demo must preserve its actual baseline failure');
  assert.match(baseline.content, /not ok|fail(?:ed|ure)?|ERR_ASSERTION/i);
  assert(verification, 'the demo must preserve actual verification output');
  assert.match(verification.content, /pass|ok \d|tests/i);
  assert(review, 'review must include separately executed checks');
  assert(diff);
  assert.match(diff.content, /^diff --git/m);
  assert.match(diff.content, /^\+/m);

  const history = await request(server.url, `/api/sessions/${created.id}/history`);
  assert.equal(history.status, 200, history.text);
  const before = history.body as Event[];
  assert(before.length > 4, 'a real workflow must retain more than a terminal status');
  assert.equal(new Set(before.map(event => event.id)).size, before.length);
  for (let index = 1; index < before.length; index++) assert(before[index].id > before[index - 1].id);

  await server.restart();
  const restored = await request(server.url, `/api/sessions/${created.id}`);
  assert.equal(restored.body.status, 'completed');
  assert.deepEqual(restored.body.artifacts, completed.artifacts);
  const durable = await request(server.url, `/api/sessions/${created.id}/history`);
  assert.deepEqual(durable.body, before);
  const cursor = before[1].id;
  const expected = before.filter(event => event.id > cursor);
  assert.deepEqual(await replay(server.url, created.id, cursor, expected.length), expected);
});

test('pause, instructions, resume, and intentional cancel remain deliberate across reconnects', { timeout: 30_000 }, async t => {
  const server = await application();
  t.after(() => server.close());
  const created = await createSession(server.url);
  assert.equal((await request(server.url, `/api/sessions/${created.id}/start`, { method: 'POST' })).status, 200);
  await sessionUntil(server.url, created.id, session => session.status === 'running');
  const paused = await request(server.url, `/api/sessions/${created.id}/pause`, { method: 'POST' });
  assert.equal(paused.status, 200, paused.text);
  await sessionUntil(server.url, created.id, session => session.status === 'paused');

  const instruction = 'Keep the existing validation for nonnegative amounts and positive quantities.';
  const message = await request(server.url, `/api/sessions/${created.id}/messages`, { method: 'POST', body: { text: instruction } });
  assert.equal(message.status, 200, message.text);
  const history = await request(server.url, `/api/sessions/${created.id}/history`);
  assert(history.text.includes(instruction), 'operator input must be durably recorded');
  await server.restart();
  await delay(150);
  const afterRestart = await request(server.url, `/api/sessions/${created.id}`);
  assert.equal(afterRestart.body.status, 'paused', 'a restart must not turn a pause into execution');
  const resumed = await request(server.url, `/api/sessions/${created.id}/resume`, { method: 'POST' });
  assert.equal(resumed.status, 200, resumed.text);
  const cancelled = await request(server.url, `/api/sessions/${created.id}/cancel`, { method: 'POST' });
  assert.equal(cancelled.status, 200, cancelled.text);
  const terminal = await sessionUntil(server.url, created.id, session => session.status === 'cancelled');
  await server.restart();
  await delay(200);
  const durable = await request(server.url, `/api/sessions/${created.id}`);
  assert.equal(durable.body.status, 'cancelled');
  assert.equal(durable.body.runs.length, terminal.runs.length, 'intentional cancellation must not create a retry');
  assert(durable.body.runs.every((run: { status: string }) => run.status !== 'running'));
  const restartCancelled = await request(server.url, `/api/sessions/${created.id}/start`, { method: 'POST' });
  assert.equal(restartCancelled.status, 409, restartCancelled.text);
});

test('HTTP lifecycle rejects duplicate execution and invalid targets without producing work', { timeout: 15_000 }, async t => {
  const server = await application();
  t.after(() => server.close());
  for (const invalid of [
    { repositoryId: 'https://attacker.invalid/repo.git' },
    { crewId: 'unknown-crew' },
    { runtime: 'unknown-runtime' },
    { budgetUsd: -1 },
    { budgetUsd: 26 },
    { budgetUsd: '3' },
    { title: '' },
    { objective: '' },
  ]) {
    const response = await request(server.url, '/api/sessions', { method: 'POST', body: createInput(invalid) });
    assert([400, 422].includes(response.status), `${JSON.stringify(invalid)}: ${response.status} ${response.text}`);
  }
  assert.deepEqual((await request(server.url, '/api/sessions')).body, []);
  const created = await createSession(server.url);
  const resumeQueued = await request(server.url, `/api/sessions/${created.id}/resume`, { method: 'POST' });
  assert.equal(resumeQueued.status, 409, resumeQueued.text);
  assert.equal((await request(server.url, `/api/sessions/${created.id}/start`, { method: 'POST' })).status, 200);
  const duplicate = await request(server.url, `/api/sessions/${created.id}/start`, { method: 'POST' });
  assert.equal(duplicate.status, 409, duplicate.text);
  assert.equal((await request(server.url, `/api/sessions/${created.id}/cancel`, { method: 'POST' })).status, 200);
});
