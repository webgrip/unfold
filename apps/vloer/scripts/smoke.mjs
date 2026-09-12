import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

const baseUrl = (process.argv[2] || process.env.VLOER_SMOKE_URL || 'http://127.0.0.1:4080').replace(/\/$/, '');
let createdId;

async function api(path, method = 'GET', body) {
  if (method === 'POST' && body === undefined) body = {};
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'x-vloer-request': '1', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5_000),
  });
  const text = await response.text();
  let value;
  try { value = JSON.parse(text); } catch { throw new Error(`${path} did not return JSON (${response.status})`); }
  if (!response.ok) throw new Error(`${path}: ${response.status} ${value.error?.message || text}`);
  return value;
}

try {
  const bootstrap = await api('/api/bootstrap');
  assert.equal(bootstrap.mode, 'demo', 'Smoke execution requires an explicitly enabled demonstration deployment. It never initiates paid model work.');
  const repository = bootstrap.repositories.find(item => item.id === 'order-service');
  const crew = bootstrap.crews.find(item => item.id === 'delivery');
  assert(repository && crew, 'The order-service demonstration repository and delivery crew must be configured.');
  const session = await api('/api/sessions', 'POST', { title: 'Smoke check: order rounding', objective: 'Fix the reproducible order rounding regression, run the actual tests, and independently review the resulting diff.', repositoryId: repository.id, crewId: crew.id, runtime: 'demo', budgetUsd: 1 });
  createdId = session.id;
  await api(`/api/sessions/${session.id}/start`, 'POST');
  const deadline = Date.now() + 45_000;
  let finished;
  while (Date.now() < deadline) {
    const current = await api(`/api/sessions/${session.id}`);
    if (['completed', 'failed', 'cancelled'].includes(current.status)) { finished = current; break; }
    await delay(150);
  }
  assert(finished, 'The demonstration did not finish within 45 seconds.');
  assert.equal(finished.status, 'completed', finished.blocker || 'The demonstration failed.');
  assert.equal(finished.spentUsd, 0, 'The demonstration must report zero model spending.');
  assert.equal(finished.costStatus, 'demo');
  assert(finished.artifacts.some(artifact => artifact.kind === 'diff' && /^diff --git/m.test(artifact.content)), 'No actual git diff was retained.');
  for (const name of ['Baseline checks (expected failure)', 'Verification checks', 'Independent review checks']) assert(finished.artifacts.some(artifact => artifact.name === name && artifact.content.length > 0), `Missing executed-check evidence: ${name}`);
  assert(finished.runs.some(run => run.mode === 'read' && run.verdict === 'approve'), 'No explicit independent review approval was recorded.');
  const history = await api(`/api/sessions/${session.id}/history`);
  assert(history.length > 4, 'The durable activity history is missing.');
  assert.equal(new Set(history.map(event => event.id)).size, history.length);
  process.stdout.write(`PASS: actual baseline failure, repaired tests, independent review, git diff and ${history.length} durable events.\nSession: ${session.id}\nMode: demo; model calls: 0; model spend: $0.00\n`);
} catch (error) {
  if (createdId) {
    try { await api(`/api/sessions/${createdId}/cancel`, 'POST'); } catch {}
  }
  process.stderr.write(`Smoke check failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
