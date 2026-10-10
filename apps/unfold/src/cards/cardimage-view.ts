import { instant } from './go.ts';

/** The Run card fields the card image, summary and comment read, shaped like the card JSON Ploeg's operator API emits (`store.OperatorCard`). Times are RFC 3339 strings; a field Ploeg omits or writes as null may be absent or null. */
export type CardImageCard = {
  workItemId: string;
  title: string;
  externalRef?: string;
  target?: { owner: string; repo: string } | null;
  state: string;
  grade?: CardImageGrade | null;
  condition?: CardImageCondition | null;
  steward?: { name: string; source: string } | null;
  crew?: CardImageCrew[] | null;
  plays?: CardImagePlay[] | null;
  totals: CardImageTotals;
  release?: CardImageRelease | null;
  demo?: boolean;
};

/** The grade fields the card image reads. */
export type CardImageGrade = {
  formula: string;
  overall: number;
  provisional: boolean;
  evidenceComplete: boolean;
  label: string | null;
  qualifiers: string[] | null;
  inputs: { missing: string[] | null };
};

/** The condition fields the card image reads: one entry per crack, mended once its mend is confirmed. */
export type CardImageCondition = { state: string; cracks: { mended: { confirmedAt: string | null } | null }[] | null };

/** One Role's Runs as the card image reads them. */
export type CardImageCrew = { role: string; runs: number };

/** One pull request of the card as the card image reads it. */
export type CardImagePlay = {
  number: number;
  state?: string;
  mergedAt?: string | null;
  additions?: number | null;
  deletions?: number | null;
  changedFiles?: number | null;
  ci?: { state: string } | null;
};

/** The cost totals the card image reads. */
export type CardImageTotals = { costUsd?: number | null; authorizedUsd: number; costStatus: string };

/** When the card's latest merged play went live. */
export type CardImageRelease = { at: string; source: string; environment: string };

/** One step of the finish ladder a released card climbs by staying live in production. */
export type Finish = { key: string; label: string; days: number; level: number };

/** Every finish in climbing order. */
export const FinishLadder: readonly Finish[] = [
  { key: 'matte', label: 'Matte', days: 0, level: 0 },
  { key: 'foil', label: 'Foil', days: 7, level: 1 },
  { key: 'holo', label: 'Holo', days: 30, level: 2 },
  { key: 'prism', label: 'Prism', days: 90, level: 3 },
  { key: 'gilded', label: 'Gilded', days: 180, level: 4 },
  { key: 'infinity', label: 'Infinity', days: 365, level: 5 },
];

/** The finish of a card that has been live for `days` whole days; a negative count is matte. */
export function finishFor(days: number): Finish {
  let out = FinishLadder[0]!;
  for (const f of FinishLadder) if (days >= f.days) out = f;
  return out;
}

const nanosPerDay = 86_400_000_000_000n;

/** Nanoseconds since the Unix epoch of an RFC 3339 time or a `Date`, keeping sub-millisecond digits as Go's `time.Time` does. */
export function nanos(value: string | Date): bigint {
  if (value instanceof Date) return BigInt(value.getTime()) * 1_000_000n;
  const ms = instant(value);
  const fraction = /T\d{2}:\d{2}:\d{2}\.(\d+)/.exec(value)?.[1] ?? '';
  return BigInt(ms) * 1_000_000n + BigInt(`${fraction.slice(3)}000000`.slice(0, 6));
}

/** Whole days since the card's release at `now`, or null when the card has no release; a release ahead of now counts 0. */
export function daysLive(card: CardImageCard, now: string | Date): number | null {
  if (!card.release) return null;
  const d = nanos(now) - nanos(card.release.at);
  if (d < 0n) return 0;
  return Number(d / nanosPerDay);
}

/** Tone of a state label. */
export type Tone = 'neutral' | 'review' | 'success' | 'danger' | 'attention' | 'live';

type Labelled = { label: string; tone: Tone };

const cardStates: Record<string, Labelled> = {
  drafting: { label: 'Drafting', tone: 'neutral' },
  in_review: { label: 'In review', tone: 'review' },
  merged: { label: 'Merged', tone: 'success' },
  closed: { label: 'Closed unmerged', tone: 'neutral' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
};

const playStates: Record<string, Labelled> = {
  open: { label: 'Open', tone: 'review' },
  merged: { label: 'Merged', tone: 'success' },
  closed: { label: 'Closed unmerged', tone: 'neutral' },
};

const ciStates: Record<string, Labelled> = {
  success: { label: 'CI passed', tone: 'success' },
  failure: { label: 'CI failed', tone: 'danger' },
  error: { label: 'CI errored', tone: 'danger' },
  pending: { label: 'CI running', tone: 'live' },
};

const stewardSources: Record<string, string> = {
  merged_by: 'Merged the pull request',
  approver: 'Approved the pull request',
};

/** The facts a card image, summary and comment show, derived from one card at one instant. */
export type CardView = {
  title: string;
  demo: boolean;
  state: Labelled;
  cost: CostView;
  diff: string;
  diffKnown: boolean;
  adds: string;
  dels: string;
  files: string;
  pr: string;
  prState: Labelled;
  ci: Labelled;
  ciKnown: boolean;
  released: boolean;
  days: number;
  dayText: string;
  finish: Finish;
  source: string;
  grade: GradeView | null;
  cracks: number;
  mended: number;
  condition: string;
  steward: string;
  stewardBy: string;
  crew: string;
  plays: string;
  ids: string[];
  repo: string;
};

type CostView = { value: string; caption: string; text: string; share: number; arc: boolean; over: boolean };

type GradeView = { overall: string; label: string; provisional: boolean; formula: string; qualifiers: string; complete: boolean; missing: string[] };

const neutral: Labelled = { label: '', tone: 'neutral' };

/** Derives the shown facts of `card` at `now`. */
export function newView(card: CardImageCard, now: string | Date): CardView {
  const v: CardView = {
    title: goTrim(card.title), demo: card.demo === true, state: neutral, cost: newCost(card), diff: '', diffKnown: false, adds: '', dels: '', files: '',
    pr: '', prState: neutral, ci: neutral, ciKnown: false, released: false, days: 0, dayText: '', finish: FinishLadder[0]!, source: '', grade: null,
    cracks: 0, mended: 0, condition: '', steward: '', stewardBy: '', crew: '', plays: '', ids: [], repo: '',
  };
  if (v.title === '') v.title = `Work Item #${card.workItemId}`;
  v.state = lookup(cardStates, card.state, 'Drafting');
  const plays = card.plays ?? [];
  [v.diffKnown, v.adds, v.dels, v.files] = diffOf(plays);
  if (plays.length === 0) v.diff = 'No pull request yet';
  else if (!v.diffKnown) v.diff = 'Not reported';
  else {
    v.diff = `${v.adds} ${v.dels}`;
    if (v.files !== '') v.diff += ` · ${v.files}`;
  }
  const latest = plays.at(-1);
  if (latest) {
    const state = latest.state ?? '';
    v.pr = `#${latest.number}`;
    v.prState = state === '' ? { label: 'In review', tone: 'review' } : lookup(playStates, state, 'In review');
    if (latest.ci && latest.ci.state !== '' && latest.ci.state !== 'unknown') {
      v.ci = lookup(ciStates, latest.ci.state, 'CI not reported');
      v.ciKnown = true;
    }
  }
  if (!v.ciKnown) v.ci = { label: 'CI not reported', tone: 'neutral' };
  const days = daysLive(card, now);
  if (days !== null) {
    v.released = true;
    v.days = days;
    v.dayText = `Day ${count(days)}`;
    v.source = card.release!.source;
  }
  v.finish = v.released ? finishFor(v.days) : FinishLadder[0]!;
  const g = card.grade;
  if (g) {
    v.grade = {
      overall: formatFixed1(g.overall), label: g.label === null || g.label === undefined ? '' : `${upperFirstByte(g.label)} Label`, provisional: g.provisional,
      formula: g.formula, qualifiers: (g.qualifiers ?? []).join(' '), complete: g.evidenceComplete, missing: g.inputs?.missing ?? [],
    };
  }
  const c = card.condition;
  if (c) {
    v.condition = c.state;
    const cracks = c.cracks ?? [];
    v.cracks = cracks.length;
    v.mended = cracks.filter((k) => k.mended && k.mended.confirmedAt !== null && k.mended.confirmedAt !== undefined).length;
  }
  if (card.steward && goTrim(card.steward.name) !== '') {
    v.steward = goTrim(card.steward.name);
    v.stewardBy = Object.hasOwn(stewardSources, card.steward.source) ? stewardSources[card.steward.source]! : '';
  }
  v.crew = crewLine(card.crew ?? []);
  v.plays = plays.length > 0 ? plural(plays.length, 'play') : 'No plays yet';
  if (card.target && card.target.owner !== '' && card.target.repo !== '') v.repo = `${card.target.owner}/${card.target.repo}`;
  for (const id of [prefixed('#', card.workItemId), goTrim(card.externalRef ?? ''), v.repo]) if (id !== '') v.ids.push(id);
  return v;
}

function prefixed(prefix: string, s: string): string {
  return goTrim(s) === '' ? '' : prefix + goTrim(s);
}

function lookup(table: Record<string, Labelled>, key: string, fallback: string): Labelled {
  if (Object.hasOwn(table, key)) return table[key]!;
  if (key === '') return { label: fallback, tone: 'neutral' };
  return { label: upperFirstByte(key.replaceAll('_', ' ')), tone: 'neutral' };
}

function newCost(card: CardImageCard): CostView {
  const t = card.totals;
  const authorized = t.authorizedUsd ?? 0;
  const of = authorized > 0 ? `of ${money(authorized)}` : '';
  const empty = { share: 0, arc: false, over: false };
  if (card.demo === true) return { value: 'Demo', caption: 'no model calls', text: 'Demo · no model calls', ...empty };
  if (t.costUsd === null || t.costUsd === undefined || t.costStatus === 'not_reported') return { value: 'Not reported', caption: of, text: 'Not reported', ...empty };
  const cost = t.costUsd;
  const c: CostView = { value: money(cost), caption: '', text: money(cost), ...empty };
  const caption: string[] = [];
  if (t.costStatus === 'reserved') {
    caption.push('reserved');
    c.text += ' reserved';
  }
  if (of !== '') {
    caption.push(of);
    c.text += ` ${of}`;
    c.share = Math.min(1, cost / authorized);
    c.arc = c.share > 0;
    c.over = cost > authorized;
  }
  c.caption = caption.join(' · ');
  return c;
}

function diffOf(plays: CardImagePlay[]): [boolean, string, string, string] {
  let adds = 0;
  let dels = 0;
  let files = 0;
  let measured = 0;
  let counted = 0;
  for (const p of plays) {
    if (p.additions === null || p.additions === undefined || p.deletions === null || p.deletions === undefined) continue;
    measured++;
    adds += p.additions;
    dels += p.deletions;
    if (p.changedFiles !== null && p.changedFiles !== undefined) {
      counted++;
      files += p.changedFiles;
    }
  }
  if (measured === 0) return [false, '', '', ''];
  return [true, `+${count(adds)}`, `−${count(dels)}`, counted > 0 ? plural(files, 'file') : ''];
}

function crewLine(crew: CardImageCrew[]): string {
  const parts: string[] = [];
  for (const m of crew) {
    let role = goTrim(m.role);
    if (role === '') continue;
    if ((m.runs ?? 0) > 0) role += ` ×${m.runs}`;
    parts.push(role);
  }
  return parts.length === 0 ? 'No agent Runs yet' : parts.join(' · ');
}

/** Formats US dollars as the card image shows them: nl-NL, two decimals, "US$ 1.234,50", and "< US$ 0,01" for a positive amount below a cent. */
export function money(value: number): string {
  if (value > 0 && value < 0.01) return '< US$ 0,01';
  const neg = value < 0;
  const v = neg ? -value : value;
  const cents = Math.trunc(v * 100 + 0.5);
  const s = `US$ ${count(Math.trunc(cents / 100))},${String(cents % 100).padStart(2, '0')}`;
  return neg ? `-${s}` : s;
}

/** Formats an integer with `.` thousands separators. */
export function count(n: number): string {
  const neg = n < 0;
  const s = String(Math.abs(Math.trunc(n)));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += '.';
    out += s[i];
  }
  return neg ? `-${out}` : out;
}

/** A counted noun: "1 file", "2 files". */
export function plural(n: number, singular: string): string {
  return n === 1 ? `${count(n)} ${singular}` : `${count(n)} ${singular}s`;
}

/** Formats a number with one decimal like Go's `strconv.FormatFloat(x, 'f', 1, 64)`, rounding exact ties to even. */
export function formatFixed1(x: number): string {
  if (Number.isNaN(x)) return 'NaN';
  if (x === Infinity) return '+Inf';
  if (x === -Infinity) return '-Inf';
  const negative = x < 0 || Object.is(x, -0);
  const a = Math.abs(x);
  let s = a.toFixed(1);
  const quarters = a * 4;
  if (Number.isInteger(quarters) && quarters % 4 === 1) {
    const tenths = Math.round(a * 10);
    s = ((tenths - 1) / 10).toFixed(1);
  }
  return negative ? `-${s}` : s;
}

const goSpace = '\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const leadingSpace = new RegExp(`^[${goSpace}]+`);
const trailingSpace = new RegExp(`[${goSpace}]+$`);
const spaceRun = new RegExp(`[${goSpace}]+`);

/** Trims Unicode white space like Go's `strings.TrimSpace`. */
export function goTrim(s: string): string {
  return s.replace(leadingSpace, '').replace(trailingSpace, '');
}

/** Splits on runs of Unicode white space like Go's `strings.Fields`. */
export function goFields(s: string): string[] {
  return s.split(spaceRun).filter((w) => w !== '');
}

/** Upper-cases one code point the way Go's `unicode.ToUpper` does where the full mapping would widen it. */
export function goUpperRune(r: string): string {
  const up = r.toUpperCase();
  return [...up].length === 1 ? up : r;
}

function upperFirstByte(s: string): string {
  const first = [...s][0] ?? '';
  return goUpperRune(first) + s.slice(first.length);
}

const bidiControl = /[؜‎‏‪-‮⁦-⁩]/u;

/** Replaces line breaks and tabs with spaces and drops control, separator, byte-order and bidi characters, as Ploeg does to every card text. */
export function clean(s: string): string {
  let out = '';
  for (const r of s) {
    const cp = r.codePointAt(0)!;
    if (r === '\n' || r === '\r' || r === '\t') out += ' ';
    else if (cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f) || r === ' ' || r === ' ' || r === '﻿' || bidiControl.test(r)) continue;
    else if (cp >= 0xd800 && cp <= 0xdfff) out += '�';
    else out += r;
  }
  return out;
}

/** Trims, cleans and truncates a text to `limit` code points, ending a cut text in "…". */
export function fit(s: string, limit: number): string {
  const r = [...goTrim(clean(s))];
  if (r.length <= limit) return r.join('');
  return `${goTrim(r.slice(0, limit - 1).join(''))}…`;
}
