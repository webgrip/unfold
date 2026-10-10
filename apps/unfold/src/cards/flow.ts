import { goRound, rfc3339Micros } from './go.ts';
import { gateKnown, goQuote, goTrimSpace, statusKey, type Instant } from './gate.ts';

/** One team's working calendar as configuration writes it; every field is optional and falls back to `DEFAULT_HOURS`. Mirrors Ploeg's `flow.Hours`. */
export interface Hours {
  timezone?: string;
  days?: readonly string[] | null;
  start?: string;
  end?: string;
  holidays?: readonly string[] | null;
}

/** The calendar of a team that configures none: Monday to Friday, 09:00 to 17:00 in Europe/Amsterdam, without holidays. */
export const DEFAULT_HOURS: Readonly<{ timezone: string; days: readonly string[]; start: string; end: string }> = Object.freeze({
  timezone: 'Europe/Amsterdam',
  days: Object.freeze(['mon', 'tue', 'wed', 'thu', 'fri']),
  start: '09:00',
  end: '17:00',
});

/** The most holidays one calendar may list. */
export const MAX_HOLIDAYS = 1000;

/** The most statuses a card lists; time beyond it still counts towards the gate and kind totals. */
export const MAX_STATUSES = 50;

const WEEKDAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const INFO_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const OFFSET_CACHE_LIMIT = 50000;

/** Describes the calendar a card's working seconds were counted with, encoded as Go encodes `flow.CalendarInfo`. */
export interface CalendarInfo {
  timezone: string;
  days: string[];
  start: string;
  end: string;
  holidays: number;
}

interface Zone {
  name: string;
  utc: boolean;
  format: Intl.DateTimeFormat;
  offsets: Map<number, number>;
}

const zones = new Map<string, Zone>();

function loadZone(name: string): Zone | null {
  const cached = zones.get(name);
  if (cached) return cached;
  if (name === 'Local' || !/^[A-Za-z]/.test(name)) return null;
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat('en-US', { timeZone: name, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  } catch {
    return null;
  }
  const zone: Zone = { name, utc: format.resolvedOptions().timeZone === 'UTC', format, offsets: new Map() };
  zones.set(name, zone);
  return zone;
}

const ZONE_UTC = loadZone('UTC')!;

function utcWall(year: number, month: number, day: number, hour: number, minute: number, second: number): number {
  const at = new Date(0);
  at.setUTCFullYear(year, month - 1, day);
  at.setUTCHours(hour, minute, second, 0);
  return at.getTime();
}

function offsetAt(zone: Zone, at: number): number {
  if (zone.utc) return 0;
  const whole = Math.floor(at / 1000) * 1000;
  const cached = zone.offsets.get(whole);
  if (cached !== undefined) return cached;
  const parts: Record<string, number> = {};
  for (const part of zone.format.formatToParts(whole)) if (part.type !== 'literal') parts[part.type] = Number(part.value);
  const offset = utcWall(parts.year!, parts.month!, parts.day!, parts.hour!, parts.minute!, parts.second!) - whole;
  if (zone.offsets.size >= OFFSET_CACHE_LIMIT) zone.offsets.clear();
  zone.offsets.set(whole, offset);
  return offset;
}

function wallClock(zone: Zone, year: number, month: number, day: number, hour: number, minute: number): number {
  const local = utcWall(year, month, day, hour, minute, 0);
  return (local - offsetAt(zone, local - offsetAt(zone, local))) * 1000;
}

function localDate(zone: Zone, at: number): { year: number; month: number; day: number; weekday: number } {
  const ms = Math.floor(at / 1000);
  const local = new Date(ms + offsetAt(zone, ms));
  return { year: local.getUTCFullYear(), month: local.getUTCMonth() + 1, day: local.getUTCDate(), weekday: local.getUTCDay() };
}

function civil(year: number, month: number, day: number): number {
  return year * 10000 + month * 100 + day;
}

function clock(text: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw new Error(`${goQuote(text)} is not HH:MM`);
  return Number(match[1]) * 60 + Number(match[2]);
}

function holidayKey(text: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1 || day > new Date(utcWall(year, month + 1, 0, 0, 0, 0)).getUTCDate()) return null;
  return civil(year, month, day);
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Counts working time: the seconds of a span inside the working hours of a working day that is not a holiday, in its zone. Build one with `newCalendar`; `new Calendar()` is Go's zero value, which counts nothing. */
export class Calendar {
  readonly #zone: Zone | null;
  readonly #days: readonly boolean[];
  readonly #start: number;
  readonly #end: number;
  readonly #holidays: ReadonlySet<number>;

  /** Wraps validated parts; prefer `newCalendar`. Without arguments it is the zero calendar. */
  constructor(parts?: { zone: string; days: readonly boolean[]; start: number; end: number; holidays: ReadonlySet<number> }) {
    this.#zone = parts ? loadZone(parts.zone) : null;
    this.#days = parts ? [...parts.days] : [false, false, false, false, false, false, false];
    this.#start = parts?.start ?? 0;
    this.#end = parts?.end ?? 0;
    this.#holidays = new Set(parts?.holidays ?? []);
  }

  /** Whole seconds between `from` and `to` in working hours, 0 when `to` is not after `from`. A day's hours are the wall-clock hours of its own date, so a daylight saving change inside them shortens or lengthens that day by the real elapsed time. */
  workingSeconds(from: Instant, to: Instant): number {
    const zone = this.#zone;
    const start = from;
    const stop = to;
    if (zone === null || !(stop > start)) return 0;
    let { year, month, day } = localDate(zone, start);
    let total = 0;
    for (;;) {
      const dayStart = wallClock(zone, year, month, day, 0, 0);
      if (!(dayStart < stop)) break;
      if (this.#days[localDate(zone, dayStart).weekday] && !this.#holidays.has(civil(year, month, day))) {
        let open = wallClock(zone, year, month, day, Math.trunc(this.#start / 60), this.#start % 60);
        let shut = wallClock(zone, year, month, day, Math.trunc(this.#end / 60), this.#end % 60);
        if (open < start) open = start;
        if (shut > stop) shut = stop;
        if (shut > open) total += shut - open;
      }
      const next = localDate(zone, wallClock(zone, year, month, day + 1, 0, 0));
      if (civil(next.year, next.month, next.day) > civil(year, month, day)) ({ year, month, day } = next);
      else ({ year, month, day } = localDate(ZONE_UTC, utcWall(year, month, day + 1, 0, 0, 0) * 1000));
    }
    return Math.trunc(total / 1_000_000);
  }

  /** Describes this calendar. */
  info(): CalendarInfo {
    const days: string[] = [];
    for (const weekday of INFO_ORDER) if (this.#days[weekday]) days.push(WEEKDAY_NAMES[weekday]);
    return {
      timezone: this.#zone?.name ?? '',
      days,
      start: `${pad2(Math.trunc(this.#start / 60))}:${pad2(this.#start % 60)}`,
      end: `${pad2(Math.trunc(this.#end / 60))}:${pad2(this.#end % 60)}`,
      holidays: this.#holidays.size,
    };
  }

  /** Names the calendar in logs. */
  toString(): string {
    const info = this.info();
    return `${info.timezone} ${info.days.join(',')} ${info.start}-${info.end}, ${info.holidays} holidays`;
  }
}

/** Validates `hours`, fills what it leaves out from `DEFAULT_HOURS` and builds its calendar; throws with Ploeg's message when invalid. */
export function newCalendar(hours: Hours = {}): Calendar {
  const timezone = hours.timezone || DEFAULT_HOURS.timezone;
  const days = hours.days ?? DEFAULT_HOURS.days;
  const start = hours.start || DEFAULT_HOURS.start;
  const end = hours.end || DEFAULT_HOURS.end;
  const holidays = hours.holidays ?? [];
  if (loadZone(timezone) === null) throw new Error(`timezone ${goQuote(timezone)} is not an IANA zone name`);
  if (days.length === 0) throw new Error('days: name at least one working day');
  const working = [false, false, false, false, false, false, false];
  for (const name of days) {
    const weekday = (WEEKDAY_NAMES as readonly string[]).indexOf(name);
    if (weekday < 0) throw new Error(`days: ${goQuote(name)} is not one of mon, tue, wed, thu, fri, sat, sun`);
    if (working[weekday]) throw new Error(`days: ${goQuote(name)} is listed twice`);
    working[weekday] = true;
  }
  let open: number;
  let shut: number;
  try {
    open = clock(start);
  } catch (error) {
    throw new Error(`start: ${(error as Error).message}`);
  }
  try {
    shut = clock(end);
  } catch (error) {
    throw new Error(`end: ${(error as Error).message}`);
  }
  if (open >= shut) throw new Error(`start ${start} must come before end ${end}`);
  if (holidays.length > MAX_HOLIDAYS) throw new Error(`holidays: at most ${MAX_HOLIDAYS} dates, got ${holidays.length}`);
  const keys = new Set<number>();
  for (const date of holidays) {
    const key = holidayKey(date);
    if (key === null) throw new Error(`holidays: ${goQuote(date)} is not a YYYY-MM-DD date`);
    if (keys.has(key)) throw new Error(`holidays: ${goQuote(date)} is listed twice`);
    keys.add(key);
  }
  return new Calendar({ zone: timezone, days: working, start: open, end: shut, holidays: keys });
}

/** The calendar of `DEFAULT_HOURS`. */
export function defaultCalendar(): Calendar {
  return newCalendar({});
}

/** What a status means for flow: someone works on it, it waits, something stops it, or it is finished. */
export type Kind = 'active' | 'waiting' | 'blocked' | 'done';

/** One board's configured status kinds: for each kind, the statuses or bucket titles that have it, overriding `defaultKind`. Mirrors Ploeg's `flow.Kinds`. */
export interface Kinds {
  active?: readonly string[];
  waiting?: readonly string[];
  blocked?: readonly string[];
  done?: readonly string[];
}

/** Words `defaultKind` looks for anywhere in a status name that make it blocked. */
export const BLOCKED_PATTERNS: readonly string[] = Object.freeze(['blocked', 'on hold', 'on-hold', 'impeded']);
/** Whole status names `defaultKind` treats as done. */
export const DONE_NAMES: readonly string[] = Object.freeze(['done', 'closed', 'complete', 'completed', 'released', 'resolved']);
/** Words `defaultKind` looks for anywhere in a status name that make it waiting. */
export const WAITING_PATTERNS: readonly string[] = Object.freeze(['ready', 'waiting', 'awaiting', 'pending', 'to review', 'to test', 'to do', 'todo', 'backlog', 'queue', 'icebox']);
/** Whole status names `defaultKind` treats as waiting. */
export const WAITING_NAMES: readonly string[] = Object.freeze(['new', 'open']);
/** Words that make a status in no gate active under `defaultKind`. */
export const ACTIVE_PATTERNS: readonly string[] = Object.freeze(['in progress', 'doing', 'progress', 'develop', 'review', 'testing', 'in test', 'qa', 'build', 'working']);

/** The kind of a status the board does not configure, for a status in gate `gate` (empty when it maps to none): blocked pattern, then done gate or name, then waiting pattern or name, then development or test gate is active, then an active pattern outside any gate, else waiting. */
export function defaultKind(status: string, gate: string = ''): Kind {
  const name = statusKey(status);
  if (BLOCKED_PATTERNS.some((pattern) => name.includes(pattern))) return 'blocked';
  if (gate === 'done' || DONE_NAMES.includes(name)) return 'done';
  if (WAITING_PATTERNS.some((pattern) => name.includes(pattern)) || WAITING_NAMES.includes(name)) return 'waiting';
  if (gate === 'development' || gate === 'test') return 'active';
  if (gate === '' && ACTIVE_PATTERNS.some((pattern) => name.includes(pattern))) return 'active';
  return 'waiting';
}

/** Resolves a status to its kind: the configured kind when the board lists it, `defaultKind` otherwise. `new KindMap()` applies the defaults only. */
export class KindMap {
  readonly #byStatus: ReadonlyMap<string, Kind>;

  /** Wraps a validated status-key-to-kind table; prefer `newKindMap`. */
  constructor(byStatus: ReadonlyMap<string, Kind> = new Map()) {
    this.#byStatus = byStatus;
  }

  /** Whether the board lists `status` under a kind. */
  configured(status: string): boolean {
    return this.#byStatus.has(statusKey(status));
  }

  /** The kind of `status` in gate `gate`, which is empty when the status maps to no gate. */
  kind(status: string, gate: string = ''): Kind {
    return this.#byStatus.get(statusKey(status)) ?? defaultKind(status, gate);
  }
}

/** Validates `kinds` (no empty, padded or over-256-byte name, no status under two kinds) and builds its map; throws with Ploeg's message otherwise. */
export function newKindMap(kinds: Kinds = {}): KindMap {
  const byStatus = new Map<string, Kind>();
  for (const kind of ['active', 'waiting', 'blocked', 'done'] as const) {
    for (const name of kinds[kind] ?? []) {
      if (name === '' || goTrimSpace(name) !== name || Buffer.byteLength(name, 'utf8') > 256) throw new Error(`${kind}: status ${goQuote(name)} must be 1 to 256 characters with no surrounding space`);
      const key = statusKey(name);
      const prev = byStatus.get(key);
      if (prev !== undefined) {
        if (prev === kind) throw new Error(`${kind}: status ${goQuote(name)} is listed twice`);
        throw new Error(`${kind}: status ${goQuote(name)} is already ${prev}`);
      }
      byStatus.set(key, kind);
    }
  }
  return new KindMap(byStatus);
}

/** The kind map of every board that records its statuses, by tracker provider and then by the provider's container id. */
export type KindBoards = Readonly<Record<string, Readonly<Record<string, KindMap>>>>;

/** The kind map of one board, or null when it has none. */
export function lookupKindBoard(boards: KindBoards, provider: string, scope: string): KindMap | null {
  return (Object.hasOwn(boards, provider) && Object.hasOwn(boards[provider]!, scope) ? boards[provider]![scope] : null) ?? null;
}

/** Whether any board of `provider` records its statuses. */
export function hasKindBoards(boards: KindBoards, provider: string): boolean {
  return Object.hasOwn(boards, provider) && Object.keys(boards[provider]!).length > 0;
}

/** One recorded move into a tracker status, oldest first. `gate` is empty or absent when the status maps to no gate; `observed` is true when `at` is when Ploeg saw the move. */
export interface FlowEntry {
  status: string;
  gate?: string;
  at: Instant;
  observed?: boolean;
}

/** One started Run; `finished` is absent or null while it runs. */
export interface FlowRun {
  started: Instant;
  finished?: Instant | null;
}

/** The first deploy of one environment that carried a merge. */
export interface FlowDeploy {
  environment: string;
  at: Instant;
}

/** One confirmed crack that was mended. */
export interface FlowRestore {
  crackId: string;
  confirmed: Instant;
  mended: Instant;
}

/** Everything `computeFlow` reads, mirroring Ploeg's `flow.Facts`; an absent or null instant is a fact nobody reported. */
export interface FlowFacts {
  now: Instant;
  statuses?: readonly FlowEntry[] | null;
  truncated?: boolean;
  trackerCreated?: Instant | null;
  firstSeen: Instant;
  admitted?: Instant | null;
  runs?: readonly FlowRun[] | null;
  firstPlay?: Instant | null;
  merge?: Instant | null;
  deploys?: readonly FlowDeploy[] | null;
  release?: Instant | null;
  releaseEnvironment?: string;
  open: boolean;
  restores?: readonly FlowRestore[] | null;
  estimateSeconds?: number | null;
  kinds?: KindMap;
  calendar: Calendar;
}

/** Time spent in one tracker status, in the order it was first entered, encoded as Go encodes `flow.Status`. */
export interface FlowStatus {
  status: string;
  gate: string | null;
  kind: Kind;
  visits: number;
  seconds: number;
  workingSeconds: number;
  observed: boolean;
  current: boolean;
}

/** A length of time in elapsed and in working seconds. */
export interface FlowDuration {
  seconds: number;
  workingSeconds: number;
}

/** A measured stretch of the ticket's life, encoded as Go encodes `flow.Span`. */
export interface FlowSpan {
  from: string;
  to: string;
  seconds: number;
  workingSeconds: number;
  running: boolean;
  start: string;
  end: string;
}

/** How long a merge took to reach one environment. */
export interface EnvironmentTime {
  environment: string;
  seconds: number;
  workingSeconds: number;
}

/** How long one confirmed crack took to mend from its confirmation; 0 when the mend came first. */
export interface RestoreTime {
  crackId: string;
  confirmedAt: string;
  mendedAt: string;
  seconds: number;
  workingSeconds: number;
}

/** The card's flow figures, encoded exactly as Go encodes `flow.Flow`: a figure nobody can know yet is null, never 0. */
export interface Flow {
  statuses: FlowStatus[];
  statusesSince: string | null;
  truncated: boolean;
  gates: Record<string, FlowDuration>;
  kinds: Record<string, FlowDuration>;
  leadTime: FlowSpan | null;
  cycleTime: FlowSpan | null;
  timeToStart: FlowSpan | null;
  efficiency: number | null;
  blockedSeconds: number | null;
  blockedWorkingSeconds: number | null;
  reopens: number | null;
  queueSeconds: number | null;
  queueWorkingSeconds: number | null;
  agentSeconds: number | null;
  runs: number;
  firstRunToFirstPlaySeconds: number | null;
  firstRunToFirstPlayWorkingSeconds: number | null;
  mergeTo: Record<string, number> | null;
  mergeToWorking: Record<string, number> | null;
  environmentsReached: string[];
  timeToProduction: EnvironmentTime | null;
  restores: RestoreTime[];
  meanRestoreSeconds: number | null;
  meanRestoreWorkingSeconds: number | null;
  estimateSeconds: number | null;
  calendar: CalendarInfo;
  notCollected: string[];
}

interface Interval {
  key: string;
  status: string;
  kind: Kind;
  gate: string;
  observed: boolean;
  from: number;
  to: number;
  length: FlowDuration;
}

function put<T>(record: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(record, key, { value, enumerable: true, writable: true, configurable: true });
}

function get<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function elapsed(from: number, to: number): number {
  return to > from ? Math.trunc((to - from) / 1_000_000) : 0;
}

function optional(at: Instant | null | undefined): number | null {
  return at === undefined || at === null ? null : at;
}

function add(a: FlowDuration | undefined, b: FlowDuration): FlowDuration {
  return { seconds: (a?.seconds ?? 0) + b.seconds, workingSeconds: (a?.workingSeconds ?? 0) + b.workingSeconds };
}

function round1(value: number): number {
  return goRound(value * 10) / 10;
}

function statusIntervals(facts: FlowFacts, now: number, kinds: KindMap): Interval[] {
  const out: Interval[] = [];
  const entries = facts.statuses ?? [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const key = statusKey(entry.status);
    if (key === '') continue;
    const at = entry.at;
    let to = i + 1 < entries.length ? entries[i + 1]!.at : now;
    if (to < at) to = at;
    const last = out[out.length - 1];
    if (last && last.key === key) {
      last.to = to;
      last.observed = last.observed || !!entry.observed;
      continue;
    }
    const gate = entry.gate ?? '';
    out.push({ key, status: entry.status, kind: kinds.kind(entry.status, gate), gate, observed: !!entry.observed, from: at, to, length: { seconds: 0, workingSeconds: 0 } });
  }
  return out;
}

function statusTable(intervals: readonly Interval[], truncated: boolean): { table: FlowStatus[]; truncated: boolean } {
  const table: FlowStatus[] = [];
  const index = new Map<string, number>();
  intervals.forEach((iv, i) => {
    let at = index.get(iv.key);
    if (at === undefined) {
      if (table.length === MAX_STATUSES) {
        truncated = true;
        return;
      }
      at = table.length;
      index.set(iv.key, at);
      table.push({ status: iv.status, gate: null, kind: '' as Kind, visits: 0, seconds: 0, workingSeconds: 0, observed: false, current: false });
    }
    const row = table[at]!;
    row.visits++;
    row.kind = iv.kind;
    row.gate = gateKnown(iv.gate) ? iv.gate : null;
    row.seconds += iv.length.seconds;
    row.workingSeconds += iv.length.workingSeconds;
    row.observed = row.observed || iv.observed;
    row.current = i === intervals.length - 1;
  });
  return { table, truncated };
}

function efficiency(intervals: readonly Interval[], from: number, to: number): number | null {
  let active = 0;
  let other = 0;
  for (const iv of intervals) {
    const a = iv.from < from ? from : iv.from;
    const b = iv.to > to ? to : iv.to;
    const s = elapsed(a, b);
    if (iv.kind === 'active') active += s;
    else if (iv.kind === 'waiting' || iv.kind === 'blocked') other += s;
  }
  if (active + other === 0) return null;
  return goRound((active / (active + other)) * 1000) / 1000;
}

function span(calendar: Calendar, from: number, to: number, start: string, end: string, running: boolean): FlowSpan {
  if (to < from) to = from;
  return { from: rfc3339Micros(from), to: rfc3339Micros(to), seconds: elapsed(from, to), workingSeconds: calendar.workingSeconds(from, to), running, start, end };
}

/** Derives the card's flow figures from `facts` exactly as Ploeg's `flow.Compute` does (ADR-0057); the same facts always give the same figures. */
export function computeFlow(facts: FlowFacts): Flow {
  const calendar = facts.calendar;
  const kinds = facts.kinds ?? new KindMap();
  const now = facts.now;
  const runs = (facts.runs ?? []).map((run) => ({ started: run.started, finished: optional(run.finished) }));
  const info = calendar.info();
  const out: Flow = {
    statuses: [], statusesSince: null, truncated: !!facts.truncated, gates: {}, kinds: {}, leadTime: null, cycleTime: null, timeToStart: null, efficiency: null,
    blockedSeconds: null, blockedWorkingSeconds: null, reopens: null, queueSeconds: null, queueWorkingSeconds: null, agentSeconds: null, runs: runs.length,
    firstRunToFirstPlaySeconds: null, firstRunToFirstPlayWorkingSeconds: null, mergeTo: null, mergeToWorking: null, environmentsReached: [], timeToProduction: null,
    restores: [], meanRestoreSeconds: null, meanRestoreWorkingSeconds: null, estimateSeconds: facts.estimateSeconds ?? null, calendar: info, notCollected: [],
  };
  const intervals = statusIntervals(facts, now, kinds);
  for (const iv of intervals) iv.length = { seconds: elapsed(iv.from, iv.to), workingSeconds: calendar.workingSeconds(iv.from, iv.to) };
  const table = statusTable(intervals, out.truncated);
  out.statuses = table.table;
  out.truncated = table.truncated;
  if (intervals.length > 0) {
    out.statusesSince = rfc3339Micros(intervals[0]!.from);
    let blocked = 0;
    let blockedWorking = 0;
    let reopens = 0;
    intervals.forEach((iv, i) => {
      if (gateKnown(iv.gate)) put(out.gates, iv.gate, add(get(out.gates, iv.gate), iv.length));
      put(out.kinds, iv.kind, add(get(out.kinds, iv.kind), iv.length));
      if (iv.kind === 'blocked') {
        blocked += iv.length.seconds;
        blockedWorking += iv.length.workingSeconds;
      }
      if (i > 0 && intervals[i - 1]!.kind === 'done' && iv.kind !== 'done') reopens++;
    });
    out.blockedSeconds = blocked;
    out.blockedWorkingSeconds = blockedWorking;
    out.reopens = reopens;
  } else {
    out.notCollected.push('statuses');
  }

  const trackerCreated = optional(facts.trackerCreated);
  const start = trackerCreated ?? facts.firstSeen;
  const startSource = trackerCreated === null ? 'first_seen' : 'tracker_created';
  let cycleStart: number | null = null;
  let cycleSource = '';
  const firstActive = intervals.find((iv) => iv.kind === 'active');
  if (firstActive) {
    cycleStart = firstActive.from;
    cycleSource = 'first_active';
  }
  for (const run of runs) {
    if (cycleStart === null || run.started < cycleStart) {
      cycleStart = run.started;
      cycleSource = 'first_run';
    }
  }
  const release = optional(facts.release);
  const ended = release !== null;
  const end = release ?? now;
  const endSource = ended ? 'release' : 'now';
  const merge = optional(facts.merge);

  if (ended || facts.open) out.leadTime = span(calendar, start, end, startSource, endSource, !ended);
  if (cycleStart !== null) {
    let cycleEnd = end;
    let cycleEndSource = endSource;
    let cycleEnded = ended;
    if (!ended && merge !== null) {
      cycleEnd = merge;
      cycleEndSource = 'merge';
      cycleEnded = true;
    }
    if (cycleEnded || facts.open) {
      const cycle = span(calendar, cycleStart, cycleEnd, cycleSource, cycleEndSource, !cycleEnded);
      out.cycleTime = cycle;
      out.efficiency = efficiency(intervals, cycleStart, Math.max(cycleStart, cycleEnd));
    }
    out.timeToStart = span(calendar, start, cycleStart, startSource, cycleSource, false);
  } else if (facts.open) {
    out.timeToStart = span(calendar, start, now, startSource, 'now', true);
  }

  let firstRun: number | null = null;
  let agent = 0;
  for (const run of runs) {
    if (firstRun === null || run.started < firstRun) firstRun = run.started;
    agent += elapsed(run.started, run.finished ?? now);
  }
  if (firstRun !== null) {
    out.agentSeconds = agent;
    const admitted = optional(facts.admitted);
    if (admitted !== null) {
      out.queueSeconds = elapsed(admitted, firstRun);
      out.queueWorkingSeconds = calendar.workingSeconds(admitted, firstRun);
    }
    const firstPlay = optional(facts.firstPlay);
    if (firstPlay !== null) {
      out.firstRunToFirstPlaySeconds = elapsed(firstRun, firstPlay);
      out.firstRunToFirstPlayWorkingSeconds = calendar.workingSeconds(firstRun, firstPlay);
    }
  }

  if (merge !== null) {
    const mergeTo: Record<string, number> = {};
    const mergeToWorking: Record<string, number> = {};
    for (const deploy of facts.deploys ?? []) {
      if (Object.hasOwn(mergeTo, deploy.environment)) continue;
      const at = deploy.at;
      const reach = elapsed(merge, at);
      const reachWorking = calendar.workingSeconds(merge, at);
      put(mergeTo, deploy.environment, reach);
      put(mergeToWorking, deploy.environment, reachWorking);
      out.environmentsReached.push(deploy.environment);
      if (deploy.environment === (facts.releaseEnvironment ?? '')) out.timeToProduction = { environment: deploy.environment, seconds: reach, workingSeconds: reachWorking };
    }
    out.mergeTo = mergeTo;
    out.mergeToWorking = mergeToWorking;
  }

  let restoreTotal = 0;
  let restoreWorking = 0;
  for (const restore of facts.restores ?? []) {
    const confirmed = restore.confirmed;
    const mended = restore.mended;
    const time: RestoreTime = { crackId: restore.crackId, confirmedAt: rfc3339Micros(confirmed), mendedAt: rfc3339Micros(mended), seconds: elapsed(confirmed, mended), workingSeconds: calendar.workingSeconds(confirmed, mended) };
    restoreTotal += time.seconds;
    restoreWorking += time.workingSeconds;
    out.restores.push(time);
  }
  if (out.restores.length > 0) {
    out.meanRestoreSeconds = round1(restoreTotal / out.restores.length);
    out.meanRestoreWorkingSeconds = round1(restoreWorking / out.restores.length);
  }

  if (facts.estimateSeconds === undefined || facts.estimateSeconds === null) out.notCollected.push('estimate');
  if (info.holidays === 0) out.notCollected.push('holidays');
  return out;
}
