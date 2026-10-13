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

test('a Work Item Ploeg calls active reads as leased, and an unknown state is still refused', () => {
  const sample = structuredClone((ploegDemo.details as any)['102']) as any;
  assert.equal(detail({ schemaVersion: '1.0', ...sample }).item.state, 'leased');
  sample.item.state = 'active';
  assert.equal(detail({ schemaVersion: '1.0', ...sample }).item.state, 'leased');
  sample.item.state = 'borrowed';
  assert.throws(() => detail({ schemaVersion: '1.0', ...sample }), /unsupported operator response/);
});

test('a Run reads every Cost Status Ploeg reports, and a Shift reads its Hold from heldUsd or the older reservedUsd', () => {
  const sample = structuredClone((ploegDemo.details as any)['104']) as any;
  const costed = sample.runs.find((run: any) => run.usage?.costUsd !== undefined) ?? sample.runs[0];
  costed.usage = { ...(costed.usage ?? {}), costUsd: 0.25 };
  for (const status of ['observed', 'provisional', 'settled', 'unknown']) {
    costed.costStatus = status;
    assert.equal(detail({ schemaVersion: '1.0', ...sample }).runs.find(run => run.id === costed.id)!.costStatus, status);
  }
  costed.costStatus = 'pending';
  assert.throws(() => detail({ schemaVersion: '1.0', ...sample }), /unsupported operator response/);
  costed.costStatus = 'settled';
  delete costed.usage.costUsd;
  assert.throws(() => detail({ schemaVersion: '1.0', ...sample }), /unsupported operator response/, 'a cost status other than unknown carries a figure');
  costed.costStatus = 'unknown';
  const shift = sample.shifts[0];
  shift.reservedUsd = 0.5;
  assert.equal(detail({ schemaVersion: '1.0', ...sample }).shifts[0].reservedUsd, 0.5);
  shift.heldUsd = 0.5;
  assert.equal(detail({ schemaVersion: '1.0', ...sample }).shifts[0].reservedUsd, 0.5);
  delete shift.reservedUsd;
  assert.equal(detail({ schemaVersion: '1.0', ...sample }).shifts[0].reservedUsd, 0.5);
});
