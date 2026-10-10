import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { micros } from '../src/cards/go.ts';
import { newGateMap, parseReason, sortedGates, walk, type Reason, type Statuses, type Transition } from '../src/cards/gate.ts';

const fixtures = new URL('./fixtures/cards/gate/', import.meta.url);

test('parseReason reads a bounce reason from a label or comment', () => {
  const cases: [string, Reason | null][] = [
    ['bounce:defect', 'defect'],
    ['Bounce:Requirement', 'requirement'],
    ['  bounce: misunderstood the login flow', 'misunderstood'],
    ['<p>bounce:environment — staging was down</p>', 'environment'],
    ['bounce:defect.', 'defect'],
    ['bounce:defective', null],
    ['bounce:unknown', null],
    ['bounce:', null],
    ['please bounce:defect', null],
    ['defect', null],
    ['', null],
  ];
  for (const [text, want] of cases) assert.equal(parseReason(text), want, text);
});

test('newGateMap rejects invalid mappings', () => {
  const cases: [string, Statuses, string][] = [
    ['empty', {}, 'maps no status'],
    ['blank status', { test: [''] }, 'non-empty'],
    ['padded status', { test: [' In test'] }, 'surrounding space'],
    ['two gates', { test: ['Review'], acceptance: ['review'] }, 'already mapped to test'],
    ['twice in one gate', { done: ['Done', 'done'] }, 'listed twice'],
  ];
  for (const [name, statuses, want] of cases) assert.throws(() => newGateMap(statuses), (error: Error) => error.message.includes(want), name);
});

test('a gate map resolves statuses', () => {
  const m = newGateMap({ development: ['Doing'], test: ['In test'], acceptance: ['Acceptance', 'UAT'], done: ['Done'] });
  const cases: [string[] | null, { gate: string; status: string } | null][] = [
    [['in test'], { gate: 'test', status: 'in test' }],
    [['Backlog', 'UAT'], { gate: 'acceptance', status: 'UAT' }],
    [['UAT', 'Acceptance'], { gate: 'acceptance', status: 'UAT' }],
    [['Doing', 'Done'], null],
    [['Backlog'], null],
    [null, null],
  ];
  for (const [statuses, want] of cases) assert.deepEqual(m.resolve(statuses), want, String(statuses));
});

test('walk derives history, bounces and right-first-time', () => {
  const at = (hour: number) => Date.UTC(2026, 9, 1, 9 + hour) * 1000;
  const iso = (hour: number) => new Date(at(hour) / 1000).toISOString().replace('.000Z', 'Z');
  const j = walk([
    { gate: 'development', at: at(0) },
    { gate: 'test', at: at(1), actor: 'dev' },
    { gate: 'test', at: at(2) },
    { gate: 'development', at: at(3), actor: 'qa', reason: 'defect' },
    { gate: 'test', at: at(4) },
    { gate: 'development', at: at(5), actor: 'qa' },
    { gate: 'test', at: at(6) },
    { gate: 'acceptance', at: at(7), actor: 'qa' },
    { gate: 'development', at: at(8), actor: 'po', reason: 'environment' },
    { gate: 'acceptance', at: at(9) },
    { gate: 'imagined', at: at(10) },
  ]);
  assert.ok(j, 'no journey');
  assert.equal(j.Current, 'acceptance');
  assert.equal(j.History.length, 9);
  assert.equal(j.History[8]!.Left, null);
  assert.equal(j.History[0]!.Left, iso(1));
  assert.deepEqual(j.Bounces, [
    { From: 'test', To: 'development', At: iso(3), Reason: 'defect', Actor: 'qa' },
    { From: 'test', To: 'development', At: iso(5), Reason: 'unknown', Actor: 'qa' },
    { From: 'acceptance', To: 'development', At: iso(8), Reason: 'environment', Actor: 'po' },
  ]);
  assert.deepEqual(j.RightFirstTime, { test: 2, acceptance: 0 }, 'an environment bounce must not count');
  assert.equal(j.Evolved, false, 'evolved without a requirement bounce');
});

test('walk marks a requirement bounce after acceptance evolved', () => {
  const base = micros('2026-10-01T09:00:00Z');
  const later = micros('2026-10-01T10:00:00.000001Z');
  const before = walk([{ gate: 'test', at: base }, { gate: 'development', at: later, reason: 'requirement' }]);
  assert.equal(before?.Evolved, false);
  assert.equal(before?.RightFirstTime.test, 0);
  const after = walk([{ gate: 'acceptance', at: base }, { gate: 'test', at: later, reason: 'requirement' }]);
  assert.equal(after?.Evolved, true);
  assert.equal(after?.RightFirstTime.acceptance, 0);
  assert.equal(walk(null), null, 'a journey without transitions');
});

test('sortedGates lists gates in order', () => {
  assert.deepEqual(sortedGates({ done: 1, development: 0, acceptance: 3, test: 2 }), ['development', 'test', 'acceptance', 'done']);
});

interface WalkFixture { name: string; transitions: (Omit<Transition, 'at'> & { at: string })[] | null; journey: unknown; ok: boolean }
interface ReasonFixture { text: string; reason: string; ok: boolean }
interface ResolveFixture { statuses: Statuses; error: string; cases: { statuses: string[] | null; gate: string; status: string; ok: boolean }[] }

test('walk, parseReason and resolve match the Go golden fixtures', () => {
  const files = readdirSync(fixtures).filter((file) => file.endsWith('.json'));
  assert.ok(files.length > 0, 'no gate fixtures');
  let checked = 0;
  for (const file of files) {
    const fixture = JSON.parse(readFileSync(new URL(file, fixtures), 'utf8')) as { walks?: WalkFixture[]; reasons?: ReasonFixture[]; maps?: ResolveFixture[] };
    for (const c of fixture.walks ?? []) {
      const j = walk(c.transitions?.map((t) => ({ ...t, at: micros(t.at) })) ?? null);
      assert.equal(j !== null, c.ok, `${file} ${c.name}`);
      if (j) assert.deepEqual(JSON.parse(JSON.stringify(j)), c.journey, `${file} ${c.name}`);
      checked++;
    }
    for (const c of fixture.reasons ?? []) {
      const reason = parseReason(c.text);
      assert.deepEqual({ reason: reason ?? '', ok: reason !== null }, { reason: c.reason, ok: c.ok }, `${file} ${JSON.stringify(c.text)}`);
      checked++;
    }
    for (const m of fixture.maps ?? []) {
      let map;
      try {
        map = newGateMap(m.statuses);
      } catch (error) {
        assert.equal((error as Error).message, m.error, `${file} ${JSON.stringify(m.statuses)}`);
        checked++;
        continue;
      }
      assert.equal(m.error, '', `${file} ${JSON.stringify(m.statuses)} was accepted`);
      for (const c of m.cases) {
        const got = map.resolve(c.statuses);
        assert.deepEqual({ gate: got?.gate ?? '', status: got?.status ?? '', ok: got !== null }, { gate: c.gate, status: c.status, ok: c.ok }, `${file} ${JSON.stringify(c.statuses)}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 100, `only ${checked} golden cases`);
});
