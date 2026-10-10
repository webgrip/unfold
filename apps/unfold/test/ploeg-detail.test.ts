import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detail } from '../src/ploeg.ts';
import { ploegDemo } from '../src/ploeg-demo.ts';

test('a Work Item detail parses when an earlier Shift and Run ran under the team the item had then', () => {
  const sample = structuredClone((ploegDemo.details as any)['104']) as any;
  const earlier = { ...structuredClone(sample.shifts[0]), id: String(Number(sample.shifts[0].id) - 1), team: 'copper', closedAt: '2026-09-11T06:00:00.000Z', closeReason: 'operator_failed' };
  sample.shifts.push(earlier);
  const earlierRun = { ...structuredClone(sample.runs.at(-1)), id: String(Number(sample.runs.at(-1).id) + 100), shiftId: earlier.id, team: 'copper', state: 'finished' };
  sample.runs.push(earlierRun);
  const parsed = detail({ schemaVersion: '1.0', ...sample });
  assert.equal(parsed.item.team, sample.item.team);
  assert.deepEqual(parsed.shifts.map(shift => shift.team), [sample.item.team, 'copper']);
  assert.equal(parsed.runs.at(-1)!.team, 'copper');
  sample.runs[0].team = 'copper';
  assert.throws(() => detail({ schemaVersion: '1.0', ...sample }), /unsupported operator response/, 'a Run of the latest Shift must still carry the item\'s team');
});

test('a Work Item detail is still refused when a Run belongs to another Work Item', () => {
  const sample = structuredClone((ploegDemo.details as any)['104']) as any;
  sample.runs.at(-1).workItemId = '999';
  assert.throws(() => detail({ schemaVersion: '1.0', ...sample }), /unsupported operator response/);
});

test('a Work Item detail parses when a finished Run from before Shifts existed ran under another team', () => {
  const sample = structuredClone((ploegDemo.details as any)['104']) as any;
  const legacy = { ...structuredClone(sample.runs.at(-1)), id: String(Number(sample.runs.at(-1).id) + 200), shiftId: null, round: 0, team: 'bronze', role: '', state: 'finished' };
  sample.runs.push(legacy);
  const parsed = detail({ schemaVersion: '1.0', ...sample });
  assert.equal(parsed.runs.at(-1)!.team, 'bronze');
  legacy.state = 'running';
  assert.throws(() => detail({ schemaVersion: '1.0', ...sample }), /unsupported operator response/, 'a Run of another team that is still running is refused');
});
