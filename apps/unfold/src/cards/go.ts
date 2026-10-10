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

/** Rounds half away from zero, as Go's `math.Round` does. */
export function goRound(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** Whole seconds in a duration of milliseconds, truncated toward zero like Go's `int64(d / time.Second)`. */
export function seconds(ms: number): number {
  return Math.trunc(ms / 1000);
}
