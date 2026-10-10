/** Formats an instant the way Go's `encoding/json` writes a UTC `time.Time`: RFC 3339 with trailing fractional zeros dropped, `Z` for UTC. */
export function rfc3339(at: number | Date): string {
  const iso = new Date(at).toISOString();
  return iso.replace(/\.(\d*?)0*Z$/, (_, fraction: string) => (fraction ? `.${fraction}Z` : 'Z'));
}

/** Parses an RFC 3339 time to epoch milliseconds, or throws when it is not one. */
export function instant(value: string): number {
  const at = Date.parse(value);
  if (!Number.isFinite(at) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error(`not an RFC 3339 time: ${value}`);
  return at;
}

/** Parses an RFC 3339 time to whole epoch microseconds, keeping the fraction Postgres stores; finer digits are truncated. Throws when it is not a time. */
export function micros(value: string): number {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  const seconds = match ? Date.parse(`${match[1]}${match[3]}`) : NaN;
  if (!match || !Number.isFinite(seconds)) throw new Error(`not an RFC 3339 time: ${value}`);
  return seconds * 1000 + Number((match[2] ?? '').padEnd(6, '0').slice(0, 6));
}

/** Formats whole epoch microseconds as Go's `encoding/json` writes a UTC `time.Time`. */
export function rfc3339Micros(at: number): string {
  const whole = Math.floor(at / 1_000_000);
  const fraction = String(at - whole * 1_000_000).padStart(6, '0').replace(/0+$/, '');
  return `${new Date(whole * 1000).toISOString().slice(0, 19)}${fraction ? `.${fraction}` : ''}Z`;
}

/** Normalises an RFC 3339 time to Go's UTC form at microsecond precision. */
export function utcTime(value: string): string {
  return rfc3339Micros(micros(value));
}

/** Rounds half away from zero, as Go's `math.Round` does. */
export function goRound(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** Whole seconds in a duration of milliseconds, truncated toward zero like Go's `int64(d / time.Second)`. */
export function seconds(ms: number): number {
  return Math.trunc(ms / 1000);
}
