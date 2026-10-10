import { rfc3339Micros } from './go.ts';

/** One stage of delivery, ordered development, test, acceptance, done; any other string is an unknown gate. Mirrors Ploeg's `gate.Gate`. */
export type Gate = 'development' | 'test' | 'acceptance' | 'done';

/** An instant as whole epoch microseconds, the precision Ploeg's Postgres timestamps carry; parse one with `micros` from `go.ts`. */
export type Instant = number;

/** Every gate from first to last, as Ploeg's `gate.Order`. */
export const GATE_ORDER: readonly Gate[] = ['development', 'test', 'acceptance', 'done'];

/** Why a Work Item bounced back to an earlier gate. */
export type Reason = 'defect' | 'requirement' | 'misunderstood' | 'environment' | 'unknown';

/** Starts a label title or comment that names a bounce reason, as in `bounce:defect`. */
export const REASON_PREFIX = 'bounce:';

const REASONS: readonly Reason[] = ['defect', 'requirement', 'misunderstood', 'environment'];

/** The gate's position in `GATE_ORDER`, or -1 for an unknown gate. */
export function gateRank(gate: string): number {
  return GATE_ORDER.indexOf(gate as Gate);
}

/** Whether `gate` is one of `GATE_ORDER`. */
export function gateKnown(gate: string): gate is Gate {
  return gateRank(gate) >= 0;
}

const GO_SPACE = /^[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/g;

/** Removes leading and trailing Unicode white space as Go's `strings.TrimSpace` does. */
export function goTrimSpace(text: string): string {
  return text.replace(GO_SPACE, '');
}

/** Lowercases each code point with its simple case mapping, as Go's `strings.ToLower` does. */
export function goToLower(text: string): string {
  let out = '';
  for (const ch of text) out += ch === '\u0130' ? 'i' : ch.toLowerCase();
  return out;
}

const GO_ESCAPES: Readonly<Record<string, string>> = { '\x07': '\\a', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\v': '\\v', '\\': '\\\\', '"': '\\"' };

/** Quotes a string the way Go's `%q` does: printable characters stay, others become Go escapes. */
export function goQuote(text: string): string {
  let out = '"';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (Object.hasOwn(GO_ESCAPES, ch)) out += GO_ESCAPES[ch];
    else if (ch === ' ' || /^[\p{L}\p{M}\p{N}\p{P}\p{S}]$/u.test(ch)) out += ch;
    else if (code < 0x80) out += `\\x${code.toString(16).padStart(2, '0')}`;
    else if (code < 0x10000) out += `\\u${code.toString(16).padStart(4, '0')}`;
    else out += `\\U${code.toString(16).padStart(8, '0')}`;
  }
  return `${out}"`;
}

/** Trims and lowercases a status name, which is how statuses compare. */
export function statusKey(status: string): string {
  return goToLower(goTrimSpace(status));
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = { amp: '&', AMP: '&', lt: '<', LT: '<', gt: '>', GT: '>', quot: '"', QUOT: '"', apos: "'", nbsp: '\u00a0' };
const LEGACY_ENTITIES: readonly string[] = ['nbsp', 'quot', 'QUOT', 'amp', 'AMP', 'lt', 'LT', 'gt', 'GT'];
const WINDOWS_1252: Readonly<Record<number, number>> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152,
  0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a,
  0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};

function unescapeHtml(text: string): string {
  return text.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);?/g, (whole, body: string) => {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X';
      let code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (code >= 0x80 && code <= 0x9f && WINDOWS_1252[code]) code = WINDOWS_1252[code];
      else if (code === 0 || (code >= 0xd800 && code <= 0xdfff) || code > 0x10ffff) code = 0xfffd;
      return String.fromCodePoint(code);
    }
    if (whole.endsWith(';') && Object.hasOwn(NAMED_ENTITIES, body)) return NAMED_ENTITIES[body]!;
    const legacy = LEGACY_ENTITIES.find((name) => body.startsWith(name));
    return legacy === undefined ? whole : NAMED_ENTITIES[legacy] + whole.slice(1 + legacy.length);
  });
}

function wordChar(ch: string): boolean {
  return ch === '_' || ch === '-' || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9');
}

/** Reads a bounce reason from a label title or comment: with HTML tags removed and leading space trimmed it must start with `bounce:`, a known reason, then the end, a space or punctuation. Case is ignored. Returns null when it names none. */
export function parseReason(text: string): Reason | null {
  const plain = goToLower(goTrimSpace(unescapeHtml(text.replace(/<[^>]*>/g, ' '))));
  if (!plain.startsWith(REASON_PREFIX)) return null;
  const rest = plain.slice(REASON_PREFIX.length).replace(/^ +/, '');
  for (const reason of REASONS) {
    if (!rest.startsWith(reason)) continue;
    const tail = rest.slice(reason.length);
    if (tail === '' || !wordChar(tail[0]!)) return reason;
  }
  return null;
}

/** One board's configured mapping: for each gate, the tracker statuses or bucket titles that put a Work Item in it. */
export interface Statuses {
  development?: string[];
  test?: string[];
  acceptance?: string[];
  done?: string[];
}

/** Resolves tracker statuses to a gate. Build one with `newGateMap`. */
export class GateMap {
  readonly #byStatus: ReadonlyMap<string, Gate>;

  /** Wraps an already validated status-to-gate table; prefer `newGateMap`. */
  constructor(byStatus: ReadonlyMap<string, Gate>) {
    this.#byStatus = byStatus;
  }

  /** The gate of a Work Item whose tracker reports `statuses` and the status that decided it, or null when none maps or two map to different gates. */
  resolve(statuses: readonly string[] | null | undefined): { gate: Gate; status: string } | null {
    let gate: Gate | null = null;
    let status = '';
    for (const s of statuses ?? []) {
      const mapped = this.#byStatus.get(statusKey(s));
      if (mapped === undefined) continue;
      if (gate !== null && mapped !== gate) return null;
      if (gate === null) {
        gate = mapped;
        status = s;
      }
    }
    return gate === null ? null : { gate, status };
  }
}

/** Validates `statuses` (at least one status, none empty or padded, none in two gates) and builds its map; throws with Ploeg's message otherwise. */
export function newGateMap(statuses: Statuses): GateMap {
  const byStatus = new Map<string, Gate>();
  for (const gate of GATE_ORDER) {
    for (const name of statuses[gate] ?? []) {
      if (name === '' || goTrimSpace(name) !== name) throw new Error(`${gate}: status ${goQuote(name)} must be non-empty with no surrounding space`);
      const key = statusKey(name);
      const prev = byStatus.get(key);
      if (prev !== undefined) {
        if (prev === gate) throw new Error(`${gate}: status ${goQuote(name)} is listed twice`);
        throw new Error(`${gate}: status ${goQuote(name)} is already mapped to ${prev}`);
      }
      byStatus.set(key, gate);
    }
  }
  if (byStatus.size === 0) throw new Error('maps no status to any gate');
  return new GateMap(byStatus);
}

/** The gate map of every configured board, by tracker provider and then by the provider's container id. */
export type GateBoards = Readonly<Record<string, Readonly<Record<string, GateMap>>>>;

/** The gate map of one board, or null when it has none. */
export function lookupGateBoard(boards: GateBoards, provider: string, scope: string): GateMap | null {
  return (Object.hasOwn(boards, provider) && Object.hasOwn(boards[provider]!, scope) ? boards[provider]![scope] : null) ?? null;
}

/** Whether any board of `provider` has a gate map. */
export function hasGateBoards(boards: GateBoards, provider: string): boolean {
  return Object.hasOwn(boards, provider) && Object.keys(boards[provider]!).length > 0;
}

/** One recorded move of a Work Item into a gate; `reason` is the bounce reason found when the move was recorded. */
export interface Transition {
  gate: string;
  status?: string;
  at: Instant;
  actor?: string;
  reason?: Reason | '';
}

/** Whether a move from one gate to another goes back. */
export function isBounce(from: string, to: string): boolean {
  return gateKnown(from) && gateKnown(to) && gateRank(to) < gateRank(from);
}

/** One stay in a gate, encoded as Go encodes `gate.Visit`; `Left` is null for the current gate. */
export interface Visit {
  Gate: Gate;
  Entered: string;
  Left: string | null;
}

/** A move back to an earlier gate, encoded as Go encodes `gate.Bounce`. */
export interface Bounce {
  From: Gate;
  To: Gate;
  At: string;
  Reason: Reason;
  Actor: string;
}

/** Whether a bounce counts against delivery: only defect and unknown bounces do. */
export function bounceCounts(bounce: Pick<Bounce, 'Reason'>): boolean {
  return bounce.Reason === 'defect' || bounce.Reason === 'unknown';
}

/** What the transitions of one Work Item say, encoded as Go encodes `gate.Journey` (no JSON tags, so Go field names; a nil `Bounces` is null). */
export interface Journey {
  Current: Gate;
  History: Visit[];
  Bounces: Bounce[] | null;
  RightFirstTime: Partial<Record<Gate, number>>;
  Evolved: boolean;
}

/** Derives the journey of `transitions`, oldest first; a move into the current gate changes nothing. Returns null when no transition enters a known gate. */
export function walk(transitions: readonly Transition[] | null | undefined): Journey | null {
  let current: Gate | '' = '';
  const history: Visit[] = [];
  let bounces: Bounce[] | null = null;
  const rightFirstTime: Partial<Record<Gate, number>> = {};
  let evolved = false;
  for (const t of transitions ?? []) {
    if (!gateKnown(t.gate) || t.gate === current) continue;
    const at = rfc3339Micros(t.at);
    if (history.length > 0) {
      history[history.length - 1]!.Left = at;
      if (isBounce(current, t.gate)) {
        const from = current as Gate;
        const bounce: Bounce = { From: from, To: t.gate, At: at, Reason: t.reason || 'unknown', Actor: t.actor ?? '' };
        (bounces ??= []).push(bounce);
        if (bounceCounts(bounce)) rightFirstTime[from] = (rightFirstTime[from] ?? 0) + 1;
        if (bounce.Reason === 'requirement' && gateRank(from) >= gateRank('acceptance')) evolved = true;
      }
    }
    if (t.gate !== 'development' && rightFirstTime[t.gate] === undefined) rightFirstTime[t.gate] = 0;
    history.push({ Gate: t.gate, Entered: at, Left: null });
    current = t.gate;
  }
  if (history.length === 0) return null;
  return { Current: current as Gate, History: history, Bounces: bounces, RightFirstTime: rightFirstTime, Evolved: evolved };
}

/** The keys of `counts` in gate order. */
export function sortedGates(counts: Partial<Record<string, number>>): string[] {
  return Object.keys(counts).sort((a, b) => gateRank(a) - gateRank(b));
}
