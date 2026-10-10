import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { micros } from '../src/cards/go.ts';
import { computeFlow, defaultCalendar, defaultKind, KindMap, MAX_STATUSES, newCalendar, newKindMap, type Calendar, type FlowEntry, type FlowFacts, type FlowSpan, type Hours, type Kind, type Kinds } from '../src/cards/flow.ts';

const fixtures = new URL('./fixtures/cards/flow/', import.meta.url);
const hour = 3600;

const amsterdam = (wall: string, offset: '+01:00' | '+02:00') => micros(`${wall.replace(' ', 'T')}:00${offset}`);
const utc = (day: number, h: number, minute: number) => Date.UTC(2026, 9, day, h, minute) * 1000;
const iso = (at: number) => new Date(at / 1000).toISOString().replace('.000Z', 'Z');
const us = (year: number, month: number, day: number, h = 0) => Date.UTC(year, month, day, h) * 1000;
const utcCalendar = () => newCalendar({ timezone: 'UTC' });
const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value));

test('the default calendar counts working hours in Amsterdam', () => {
  const c = defaultCalendar();
  const s = '+02:00';
  const w = '+01:00';
  const cases: [string, number, number, number][] = [
    ['inside one working day', amsterdam('2026-10-05 10:00', s), amsterdam('2026-10-05 12:30', s), 2 * hour + 1800],
    ['before opening and after closing', amsterdam('2026-10-05 06:00', s), amsterdam('2026-10-05 20:00', s), 8 * hour],
    ['over a night', amsterdam('2026-10-05 16:00', s), amsterdam('2026-10-06 10:00', s), 2 * hour],
    ['a whole weekend', amsterdam('2026-10-03 00:00', s), amsterdam('2026-10-05 00:00', s), 0],
    ['Friday afternoon to Monday morning', amsterdam('2026-10-02 16:30', s), amsterdam('2026-10-05 09:30', s), hour],
    ['a full week', amsterdam('2026-10-05 09:00', s), amsterdam('2026-10-12 09:00', s), 40 * hour],
    ['over the spring daylight saving change', amsterdam('2026-03-27 16:00', w), amsterdam('2026-03-30 10:00', s), 2 * hour],
    ['over the autumn daylight saving change', amsterdam('2026-10-23 16:00', s), amsterdam('2026-10-26 10:00', w), 2 * hour],
    ['over a month boundary', amsterdam('2026-09-30 16:00', s), amsterdam('2026-10-01 10:00', s), 2 * hour],
    ['empty', amsterdam('2026-10-05 10:00', s), amsterdam('2026-10-05 10:00', s), 0],
    ['backwards', amsterdam('2026-10-05 12:00', s), amsterdam('2026-10-05 10:00', s), 0],
  ];
  for (const [name, from, to, want] of cases) assert.equal(c.workingSeconds(from, to), want, name);
});

test('a calendar counts UTC instants in its zone', () => {
  const c = defaultCalendar();
  const from = us(2026, 6, 6, 7);
  const to = us(2026, 6, 6, 8);
  assert.equal(c.workingSeconds(from, to), 3600, '07:00-08:00 UTC is 09:00-10:00 in Amsterdam summer time');
  assert.equal(c.workingSeconds(us(2026, 6, 6, 6), from), 0, '08:00-09:00 in Amsterdam is before opening');
});

test('a calendar counts real time when daylight saving changes inside working hours', () => {
  const c = newCalendar({ days: ['sun'], start: '01:00', end: '04:00' });
  const spring = c.workingSeconds(amsterdam('2026-03-29 00:00', '+01:00'), amsterdam('2026-03-29 12:00', '+02:00'));
  const autumn = c.workingSeconds(amsterdam('2026-10-25 00:00', '+02:00'), amsterdam('2026-10-25 12:00', '+01:00'));
  const normal = c.workingSeconds(amsterdam('2026-10-18 00:00', '+02:00'), amsterdam('2026-10-18 12:00', '+02:00'));
  assert.deepEqual([spring, autumn, normal], [2 * 3600, 4 * 3600, 3 * 3600]);
});

test('a calendar skips configured holidays and days', () => {
  const c = newCalendar({ timezone: 'UTC', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], start: '08:00', end: '12:00', holidays: ['2026-12-25'] });
  assert.equal(c.workingSeconds(us(2026, 11, 24), us(2026, 11, 28)), 2 * 4 * 3600, 'Thursday and Saturday count, Christmas and Sunday do not');
  assert.deepEqual(c.info(), { timezone: 'UTC', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], start: '08:00', end: '12:00', holidays: 1 });
});

test('newCalendar refuses bad hours', () => {
  const bad: Hours[] = [
    { timezone: 'Mars/Olympus' },
    { timezone: 'Local' },
    { days: [] },
    { days: ['monday'] },
    { days: ['mon', 'mon'] },
    { start: '9:00' },
    { start: '25:00' },
    { end: '17:00:00' },
    { start: '17:00', end: '09:00' },
    { start: '09:00', end: '09:00' },
    { holidays: ['25-12-2026'] },
    { holidays: ['2026-12-25', '2026-12-25'] },
  ];
  for (const hours of bad) assert.throws(() => newCalendar(hours), Error, `${JSON.stringify(hours)} was accepted`);
  assert.deepEqual(defaultCalendar().info(), { timezone: 'Europe/Amsterdam', days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '09:00', end: '17:00', holidays: 0 });
});

test('defaultKind', () => {
  const cases: [string, string, Kind][] = [
    ['Doing', 'development', 'active'],
    ['In test', 'test', 'active'],
    ['In review', 'test', 'active'],
    ['Ready for test', 'test', 'waiting'],
    ['Waiting for client', 'development', 'waiting'],
    ['To review', 'test', 'waiting'],
    ['Merge queue', 'development', 'waiting'],
    ['Blocked', 'development', 'blocked'],
    ['On hold', '', 'blocked'],
    ['Blocked by legal', 'acceptance', 'blocked'],
    ['UAT', 'acceptance', 'waiting'],
    ['Done', 'done', 'done'],
    ['Shipped', 'done', 'done'],
    ['Closed', '', 'done'],
    ['Backlog', '', 'waiting'],
    ['Refinement', '', 'waiting'],
    ['Ready', '', 'waiting'],
    ['Open', '', 'waiting'],
    ['In progress', '', 'active'],
    ['Code review', '', 'active'],
    ['QA', '', 'active'],
    ['Something else', '', 'waiting'],
    ['  DOING  ', 'development', 'active'],
  ];
  for (const [status, gate, want] of cases) assert.equal(defaultKind(status, gate), want, `defaultKind(${status}, ${gate})`);
});

test('a kind map overrides the defaults', () => {
  const m = newKindMap({ active: ['UAT', 'Refinement'], waiting: ['In test'], blocked: ['Parked'], done: ["Won't do"] });
  const cases: [string, string, Kind][] = [
    ['uat', 'acceptance', 'active'],
    ['Refinement', '', 'active'],
    ['IN TEST', 'test', 'waiting'],
    ['Parked', '', 'blocked'],
    ["Won't do", '', 'done'],
    ['Doing', 'development', 'active'],
    ['Blocked', 'development', 'blocked'],
  ];
  for (const [status, gate, want] of cases) assert.equal(m.kind(status, gate), want, `kind(${status}, ${gate})`);
  assert.ok(m.configured(' uat ') && !m.configured('Doing'), 'configured must report exactly the listed statuses');
  const zero = new KindMap();
  assert.ok(zero.kind('Doing', 'development') === 'active' && !zero.configured('Doing'), 'the zero kind map applies the defaults');
});

test('newKindMap refuses bad lists', () => {
  const bad: Kinds[] = [{ active: [''] }, { active: [' Doing'] }, { active: ['Doing', 'doing'] }, { active: ['Doing'], waiting: ['DOING'] }];
  for (const kinds of bad) assert.throws(() => newKindMap(kinds), Error, `${JSON.stringify(kinds)} was accepted`);
  assert.doesNotThrow(() => newKindMap({}), 'an empty list applies the defaults');
});

function releasedFacts(): FlowFacts {
  return {
    now: utc(7, 9, 0),
    trackerCreated: utc(2, 9, 0),
    firstSeen: utc(5, 8, 0),
    admitted: utc(5, 8, 0),
    statuses: [
      { status: 'Backlog', at: utc(5, 8, 0), observed: true },
      { status: 'Doing', gate: 'development', at: utc(5, 9, 0) },
      { status: 'Blocked', gate: 'development', at: utc(5, 11, 0) },
      { status: 'Doing', gate: 'development', at: utc(5, 12, 0) },
      { status: 'Ready for test', gate: 'test', at: utc(5, 13, 0) },
      { status: 'In test', gate: 'test', at: utc(5, 14, 0) },
      { status: 'Done', gate: 'done', at: utc(5, 15, 0) },
      { status: 'Doing', gate: 'development', at: utc(6, 9, 0) },
      { status: 'Done', gate: 'done', at: utc(6, 10, 0), observed: true },
    ],
    runs: [{ started: utc(5, 9, 30), finished: utc(5, 10, 30) }, { started: utc(6, 9, 10), finished: utc(6, 9, 40) }],
    firstPlay: utc(5, 10, 30),
    merge: utc(6, 9, 50),
    deploys: [{ environment: 'test', at: utc(6, 10, 0) }, { environment: 'production', at: utc(6, 12, 0) }],
    release: utc(6, 12, 0),
    releaseEnvironment: 'production',
    open: true,
    restores: [{ crackId: '7', confirmed: utc(6, 13, 0), mended: utc(6, 16, 0) }, { crackId: '8', confirmed: utc(6, 14, 0), mended: utc(6, 11, 0) }],
    calendar: utcCalendar(),
  };
}

function checkSpan(name: string, got: FlowSpan | null, want: Omit<FlowSpan, 'from' | 'to' | 'running'> & { from: number; to: number; running?: boolean }) {
  assert.ok(got, `${name} is null`);
  assert.deepEqual(got, { ...want, from: iso(want.from), to: iso(want.to), running: want.running ?? false }, name);
}

test('computeFlow: a released card', () => {
  const f = computeFlow(releasedFacts());
  assert.deepEqual(f.statuses.map((s) => [s.status, s.gate ?? '-', s.kind, s.visits, s.seconds, s.workingSeconds, s.observed, s.current]), [
    ['Backlog', '-', 'waiting', 1, 3600, 0, true, false],
    ['Doing', 'development', 'active', 3, 14400, 14400, false, false],
    ['Blocked', 'development', 'blocked', 1, 3600, 3600, false, false],
    ['Ready for test', 'test', 'waiting', 1, 3600, 3600, false, false],
    ['In test', 'test', 'active', 1, 3600, 3600, false, false],
    ['Done', 'done', 'done', 2, 147600, 32400, true, true],
  ]);
  assert.equal(f.statusesSince, iso(utc(5, 8, 0)));
  assert.equal(f.truncated, false);
  assert.deepEqual(roundTrip(f.gates), { development: { seconds: 18000, workingSeconds: 18000 }, test: { seconds: 7200, workingSeconds: 7200 }, done: { seconds: 147600, workingSeconds: 32400 } });
  assert.deepEqual(roundTrip(f.kinds), { active: { seconds: 18000, workingSeconds: 18000 }, waiting: { seconds: 7200, workingSeconds: 3600 }, blocked: { seconds: 3600, workingSeconds: 3600 }, done: { seconds: 147600, workingSeconds: 32400 } });
  assert.deepEqual([f.blockedSeconds, f.blockedWorkingSeconds, f.reopens], [3600, 3600, 1]);
  checkSpan('leadTime', f.leadTime, { from: utc(2, 9, 0), to: utc(6, 12, 0), seconds: 99 * 3600, workingSeconds: 19 * 3600, start: 'tracker_created', end: 'release' });
  checkSpan('cycleTime', f.cycleTime, { from: utc(5, 9, 0), to: utc(6, 12, 0), seconds: 27 * 3600, workingSeconds: 11 * 3600, start: 'first_active', end: 'release' });
  checkSpan('timeToStart', f.timeToStart, { from: utc(2, 9, 0), to: utc(5, 9, 0), seconds: 72 * 3600, workingSeconds: 8 * 3600, start: 'tracker_created', end: 'first_active' });
  assert.equal(f.efficiency, 0.714, '18000 active of 25200 active, waiting and blocked seconds in the cycle');
  assert.deepEqual([f.queueSeconds, f.queueWorkingSeconds, f.agentSeconds, f.runs, f.firstRunToFirstPlaySeconds, f.firstRunToFirstPlayWorkingSeconds], [5400, 1800, 5400, 2, 3600, 3600]);
  assert.deepEqual(roundTrip(f.mergeTo), { test: 600, production: 7800 });
  assert.deepEqual(roundTrip(f.mergeToWorking), { test: 600, production: 7800 });
  assert.deepEqual(f.environmentsReached, ['test', 'production']);
  assert.deepEqual(f.timeToProduction, { environment: 'production', seconds: 7800, workingSeconds: 7800 });
  assert.equal(f.restores.length, 2);
  assert.deepEqual([f.restores[0]!.seconds, f.restores[0]!.workingSeconds, f.restores[1]!.seconds, f.meanRestoreSeconds, f.meanRestoreWorkingSeconds], [10800, 10800, 0, 5400, 5400]);
  assert.deepEqual(f.notCollected, ['estimate', 'holidays']);
  assert.equal(f.estimateSeconds, null);
});

test('computeFlow: an open card runs to now', () => {
  const f = computeFlow({
    now: utc(6, 12, 0), firstSeen: utc(5, 8, 0), admitted: utc(5, 8, 0),
    statuses: [{ status: 'To do', at: utc(5, 8, 0) }, { status: 'In progress', at: utc(5, 10, 0) }],
    runs: [{ started: utc(6, 11, 0) }], open: true, calendar: utcCalendar(),
  });
  checkSpan('leadTime', f.leadTime, { from: utc(5, 8, 0), to: utc(6, 12, 0), seconds: 28 * 3600, workingSeconds: 11 * 3600, running: true, start: 'first_seen', end: 'now' });
  checkSpan('cycleTime', f.cycleTime, { from: utc(5, 10, 0), to: utc(6, 12, 0), seconds: 26 * 3600, workingSeconds: 10 * 3600, running: true, start: 'first_active', end: 'now' });
  assert.deepEqual([f.agentSeconds, f.efficiency, f.mergeTo, f.timeToProduction, f.firstRunToFirstPlaySeconds], [3600, 1, null, null, null]);
  assert.ok(f.statuses[1]!.current && f.statuses[1]!.kind === 'active' && f.statuses[0]!.kind === 'waiting');
});

test('computeFlow: a merged card without release ends its cycle at the merge', () => {
  const f = computeFlow({
    now: utc(7, 12, 0), firstSeen: utc(5, 8, 0), trackerCreated: utc(5, 7, 0),
    runs: [{ started: utc(5, 9, 0), finished: utc(5, 9, 30) }],
    merge: utc(5, 15, 0), deploys: [{ environment: 'test', at: utc(5, 16, 0) }], releaseEnvironment: 'production',
    open: true, estimateSeconds: 7200, calendar: utcCalendar(),
  });
  checkSpan('cycleTime', f.cycleTime, { from: utc(5, 9, 0), to: utc(5, 15, 0), seconds: 6 * 3600, workingSeconds: 6 * 3600, start: 'first_run', end: 'merge' });
  assert.ok(f.leadTime?.running && f.leadTime.end === 'now');
  assert.equal(f.timeToProduction, null);
  assert.deepEqual(f.environmentsReached, ['test']);
  assert.equal(f.mergeTo?.test, 3600);
  assert.deepEqual([f.statuses.length, f.statusesSince, f.blockedSeconds, f.reopens, f.efficiency], [0, null, null, null, null], 'without recorded statuses nothing status-based is known');
  assert.deepEqual(f.notCollected, ['statuses', 'holidays']);
  assert.equal(f.estimateSeconds, 7200);
});

test('computeFlow: a closed card has no lead or cycle time', () => {
  const f = computeFlow({
    now: utc(7, 12, 0), firstSeen: utc(5, 8, 0), open: false,
    statuses: [{ status: 'Doing', gate: 'development', at: utc(5, 9, 0) }],
    runs: [{ started: utc(5, 10, 0), finished: utc(5, 11, 0) }],
    calendar: utcCalendar(),
  });
  assert.deepEqual([f.leadTime, f.cycleTime, f.efficiency, f.queueSeconds], [null, null, null, null], 'a card that will deliver nothing');
  checkSpan('timeToStart', f.timeToStart, { from: utc(5, 8, 0), to: utc(5, 9, 0), seconds: 3600, workingSeconds: 0, start: 'first_seen', end: 'first_active' });
});

test('computeFlow: an unstarted card waits to start', () => {
  const f = computeFlow({ now: utc(5, 12, 0), firstSeen: utc(5, 8, 0), open: true, calendar: utcCalendar(), statuses: [{ status: 'Backlog', at: utc(5, 8, 0) }] });
  checkSpan('timeToStart', f.timeToStart, { from: utc(5, 8, 0), to: utc(5, 12, 0), seconds: 4 * 3600, workingSeconds: 3 * 3600, running: true, start: 'first_seen', end: 'now' });
  assert.deepEqual([f.cycleTime, f.agentSeconds, f.runs], [null, null, 0]);
});

test('computeFlow caps the status table', () => {
  const entries: FlowEntry[] = [];
  for (let i = 0; i < MAX_STATUSES + 10; i++) entries.push({ status: `Column ${i}`, at: utc(5, 0, i) });
  const f = computeFlow({ now: utc(5, 2, 0), firstSeen: utc(5, 0, 0), statuses: entries, open: false, calendar: utcCalendar() });
  assert.equal(f.statuses.length, MAX_STATUSES);
  assert.equal(f.truncated, true);
  assert.equal(f.kinds.waiting?.seconds, 2 * 3600, 'time beyond the cap must still count towards the kinds');
});

test('computeFlow merges repeated statuses and keeps the first spelling', () => {
  const f = computeFlow({ now: utc(5, 12, 0), firstSeen: utc(5, 8, 0), open: false, calendar: utcCalendar(), statuses: [
    { status: 'Doing', gate: 'development', at: utc(5, 9, 0) },
    { status: 'doing', gate: 'development', at: utc(5, 10, 0), observed: true },
  ] });
  assert.equal(f.statuses.length, 1);
  assert.deepEqual([f.statuses[0]!.status, f.statuses[0]!.visits, f.statuses[0]!.seconds, f.statuses[0]!.observed], ['Doing', 1, 3 * 3600, true]);
});

test('a flow encodes unknowns as null', () => {
  const m = roundTrip(computeFlow({ now: utc(5, 12, 0), firstSeen: utc(5, 8, 0), open: false, calendar: defaultCalendar() })) as Record<string, unknown>;
  for (const key of ['leadTime', 'cycleTime', 'efficiency', 'blockedSeconds', 'reopens', 'queueSeconds', 'agentSeconds', 'firstRunToFirstPlaySeconds', 'mergeTo', 'timeToProduction', 'meanRestoreSeconds', 'estimateSeconds', 'statusesSince']) {
    assert.ok(Object.hasOwn(m, key) && m[key] === null, `${key} = ${String(m[key])}; an unknown figure is null, never 0`);
  }
});

test('computeFlow handles a long busy card quickly', () => {
  const start = us(2024, 9, 1, 9);
  const names = ['Backlog', 'Doing', 'Blocked', 'Ready for test', 'In test', 'UAT', 'Done'];
  const statuses: FlowEntry[] = [];
  for (let i = 0; i < 500; i++) statuses.push({ status: names[i % names.length]!, at: start + i * 35 * hour * 1e6 });
  const began = performance.now();
  computeFlow({ now: start + 2 * 365 * 24 * hour * 1e6, firstSeen: start, trackerCreated: start - 24 * hour * 1e6, statuses, runs: [{ started: start + hour * 1e6, finished: start + 2 * hour * 1e6 }], open: true, calendar: defaultCalendar() });
  assert.ok(performance.now() - began < 5000);
});

interface FlowInput {
  now: string; statuses?: (Omit<FlowEntry, 'at'> & { at: string })[]; truncated?: boolean; trackerCreated?: string; firstSeen: string; admitted?: string;
  runs?: { started: string; finished?: string }[]; firstPlay?: string; merge?: string; deploys?: { environment: string; at: string }[]; release?: string;
  releaseEnvironment?: string; open: boolean; restores?: { crackId: string; confirmed: string; mended: string }[]; estimateSeconds?: number; hours: Hours; kinds?: Kinds;
}

const maybe = (at: string | undefined) => (at === undefined ? null : micros(at));

function factsOf(input: FlowInput): FlowFacts {
  return {
    now: micros(input.now), firstSeen: micros(input.firstSeen), trackerCreated: maybe(input.trackerCreated), admitted: maybe(input.admitted), firstPlay: maybe(input.firstPlay),
    merge: maybe(input.merge), release: maybe(input.release), truncated: input.truncated, open: input.open, releaseEnvironment: input.releaseEnvironment, estimateSeconds: input.estimateSeconds,
    statuses: input.statuses?.map((e) => ({ ...e, at: micros(e.at) })), runs: input.runs?.map((r) => ({ started: micros(r.started), finished: maybe(r.finished) })),
    deploys: input.deploys?.map((d) => ({ environment: d.environment, at: micros(d.at) })),
    restores: input.restores?.map((r) => ({ crackId: r.crackId, confirmed: micros(r.confirmed), mended: micros(r.mended) })),
    calendar: newCalendar(input.hours), kinds: newKindMap(input.kinds ?? {}),
  };
}
interface CalendarCase { hours: Hours; error: string; spans?: { from: string; to: string; workingSeconds: number }[]; info?: unknown }
interface KindCase { kinds: Kinds; error: string; statuses?: { status: string; gate: string; kind: string; configured: boolean }[] }

function calendarOf(hours: Hours): Calendar {
  return newCalendar(hours);
}

test('computeFlow, calendars and kinds match the Go golden fixtures', () => {
  const files = readdirSync(fixtures).filter((file) => file.endsWith('.json'));
  assert.ok(files.length > 0, 'no flow fixtures');
  let checked = 0;
  for (const file of files) {
    const fixture = JSON.parse(readFileSync(new URL(file, fixtures), 'utf8')) as { flows?: { name: string; input: FlowInput; output: unknown }[]; calendars?: CalendarCase[]; kinds?: KindCase[] };
    for (const c of fixture.flows ?? []) {
      const flow = computeFlow(factsOf(c.input));
      assert.deepEqual(roundTrip(flow), c.output, `${file} ${c.name}`);
      checked++;
    }
    for (const c of fixture.calendars ?? []) {
      let calendar: Calendar;
      try {
        calendar = calendarOf(c.hours);
      } catch (error) {
        assert.equal((error as Error).message, c.error, `${file} ${JSON.stringify(c.hours)}`);
        checked++;
        continue;
      }
      assert.equal(c.error, '', `${file} ${JSON.stringify(c.hours)} was accepted`);
      assert.deepEqual(calendar.info(), c.info, `${file} ${JSON.stringify(c.hours)} info`);
      for (const s of c.spans ?? []) {
        assert.equal(calendar.workingSeconds(micros(s.from), micros(s.to)), s.workingSeconds, `${file} ${JSON.stringify(c.hours)} ${s.from} .. ${s.to}`);
        checked++;
      }
    }
    for (const c of fixture.kinds ?? []) {
      let map: KindMap;
      try {
        map = newKindMap(c.kinds);
      } catch (error) {
        assert.equal((error as Error).message, c.error, `${file} ${JSON.stringify(c.kinds)}`);
        checked++;
        continue;
      }
      assert.equal(c.error, '', `${file} ${JSON.stringify(c.kinds)} was accepted`);
      for (const s of c.statuses ?? []) {
        assert.deepEqual({ kind: map.kind(s.status, s.gate), configured: map.configured(s.status) }, { kind: s.kind, configured: s.configured }, `${file} ${JSON.stringify(s.status)} in ${s.gate}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 1000, `only ${checked} golden cases`);
});
