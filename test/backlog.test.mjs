import test from 'node:test';
import assert from 'node:assert/strict';
import { readBacklog, validateBacklog, csvCell, clickupCsv, sessionPayload, brief } from '../scripts/backlog.mjs';

test('backlog has complete audit coverage and dependency-safe planning order', () => {
  const backlog = readBacklog(); const result = validateBacklog(backlog);
  assert.equal(result.count, 78);
  for (const task of backlog.tickets) for (const dependency of task.dependsOn) assert(result.order.indexOf(dependency) < result.order.indexOf(task.id));
  assert.equal(Object.keys(backlog.gapCoverage).length, 30);
});
test('backlog rejects cycles, absent dependencies and false gap mappings', () => {
  const cycle = readBacklog(); cycle.tickets[0].dependsOn = ['PV-002']; cycle.tickets[1].dependsOn = ['PV-001'];
  assert.throws(() => validateBacklog(cycle), /cycle/);
  const missing = readBacklog(); missing.tickets[0].dependsOn = ['PV-999']; assert.throws(() => validateBacklog(missing), /Unknown dependency/);
  const coverage = readBacklog(); coverage.gapCoverage['GAP-01'] = ['PV-999']; assert.throws(() => validateBacklog(coverage), /coverage/);
});
test('ticket exports preserve multiline bodies and neutralize spreadsheet formula cells', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('hello, "world"\nsecond line'), '"hello, ""world""\nsecond line"');
  const backlog = readBacklog(); const csv = clickupCsv(backlog);
  assert(csv.startsWith('"Task Name","Description content"'));
  assert(csv.includes('[PV-001]')); assert(csv.includes('No code dependencies'));
  assert(brief(backlog.tickets[0]).includes('not an execution grant'));
});
test('session payload requires explicit profiles and budget without inventing tracker identity', () => {
  const task = readBacklog().tickets[0]; const payload = sessionPayload(task, { repositoryId: 'vloer', crewId: 'delivery', runtime: 'opencode', budgetUsd: 2 });
  assert.equal(payload.repositoryId, 'vloer'); assert.equal(payload.budgetUsd, 2); assert(payload.objective.length <= 16000);
  assert.equal('trackerUrl' in payload, false); assert.equal('url' in payload, false);
  assert.throws(() => sessionPayload(task, { repositoryId: 'https://evil.example', crewId: 'delivery', runtime: 'opencode', budgetUsd: 2 }), /registered profile/);
  assert.throws(() => sessionPayload(task, { repositoryId: 'vloer', crewId: 'delivery', runtime: 'opencode', budgetUsd: NaN }), /budget/);
});
