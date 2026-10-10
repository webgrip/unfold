const encoder = new TextEncoder();

/** The UTF-8 bytes of a string, as Go holds a `string`. */
export function utf8(value: string): Uint8Array {
  return encoder.encode(value);
}

/** The length of a string in UTF-8 bytes, as Go's `len(s)`. */
export function byteLength(value: string): number {
  return encoder.encode(value).length;
}

/** The replacement rune Go's `utf8.RuneError` stands for. */
export const runeError = 0xfffd;

/** Decodes the first rune of `bytes` from `start` as Go's `utf8.DecodeRune`: `[rune, size]`, `[runeError, 1]` on an invalid byte and `[runeError, 0]` at the end. */
export function decodeRune(bytes: Uint8Array, start = 0): [number, number] {
  const n = bytes.length - start;
  if (n < 1) return [runeError, 0];
  const b0 = bytes[start]!;
  if (b0 < 0x80) return [b0, 1];
  let size: number;
  let lo = 0x80;
  let hi = 0xbf;
  if (b0 >= 0xc2 && b0 <= 0xdf) size = 2;
  else if (b0 >= 0xe0 && b0 <= 0xef) {
    size = 3;
    if (b0 === 0xe0) lo = 0xa0;
    else if (b0 === 0xed) hi = 0x9f;
  } else if (b0 >= 0xf0 && b0 <= 0xf4) {
    size = 4;
    if (b0 === 0xf0) lo = 0x90;
    else if (b0 === 0xf4) hi = 0x8f;
  } else return [runeError, 1];
  if (n < size) return [runeError, 1];
  const b1 = bytes[start + 1]!;
  if (b1 < lo || b1 > hi) return [runeError, 1];
  if (size === 2) return [((b0 & 0x1f) << 6) | (b1 & 0x3f), 2];
  const b2 = bytes[start + 2]!;
  if (b2 < 0x80 || b2 > 0xbf) return [runeError, 1];
  if (size === 3) return [((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f), 3];
  const b3 = bytes[start + 3]!;
  if (b3 < 0x80 || b3 > 0xbf) return [runeError, 1];
  return [((b0 & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f), 4];
}

/** Decodes UTF-8 bytes the way Go's `encoding/json` writes a string: every byte that starts no valid rune becomes U+FFFD. */
export function decodeUtf8(bytes: Uint8Array, start = 0, end = bytes.length): string {
  let out = '';
  let i = start;
  while (i < end) {
    const [rune, size] = decodeRune(bytes.subarray(0, end), i);
    out += String.fromCodePoint(rune);
    i += size;
  }
  return out;
}

/** Compares two strings by their UTF-8 bytes, as Go's `<` on strings and `sort.Strings` do. */
export function compareStrings(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  for (let i = 0; i < x.length && i < y.length; i++) {
    const p = x[i]!.codePointAt(0)!;
    const q = y[i]!.codePointAt(0)!;
    if (p !== q) return p < q ? -1 : 1;
  }
  return x.length === y.length ? 0 : x.length < y.length ? -1 : 1;
}

function isGoSpace(cp: number): boolean {
  if (cp <= 0xff) return cp === 0x09 || cp === 0x0a || cp === 0x0b || cp === 0x0c || cp === 0x0d || cp === 0x20 || cp === 0x85 || cp === 0xa0;
  return cp === 0x1680 || (cp >= 0x2000 && cp <= 0x200a) || cp === 0x2028 || cp === 0x2029 || cp === 0x202f || cp === 0x205f || cp === 0x3000;
}

/** Trims leading and trailing white space as Go's `strings.TrimSpace` does (`unicode.IsSpace`). */
export function trimSpace(value: string): string {
  const points = [...value];
  let start = 0;
  let end = points.length;
  while (start < end && isGoSpace(points[start]!.codePointAt(0)!)) start++;
  while (end > start && isGoSpace(points[end - 1]!.codePointAt(0)!)) end--;
  return points.slice(start, end).join('');
}

/** Trims every leading and trailing `cut` character, as Go's `strings.Trim` with a one-character cutset. */
export function trimChar(value: string, cut: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === cut) start++;
  while (end > start && value[end - 1] === cut) end--;
  return value.slice(start, end);
}

function lowerRune(cp: number): number {
  return String.fromCodePoint(cp).toLowerCase().codePointAt(0)!;
}

function upperRune(cp: number): number {
  const upper = String.fromCodePoint(cp).toUpperCase();
  return [...upper].length === 1 ? upper.codePointAt(0)! : cp;
}

/** Lower-cases rune by rune, as Go's `strings.ToLower` does, without context-dependent special casing. */
export function toLower(value: string): string {
  let out = '';
  for (const ch of value) out += String.fromCodePoint(lowerRune(ch.codePointAt(0)!));
  return out;
}

/** Reports whether two strings are equal under simple case folding, as Go's `strings.EqualFold`. */
export function equalFold(a: string, b: string): boolean {
  const x = [...a];
  const y = [...b];
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) {
    const p = x[i]!.codePointAt(0)!;
    const q = y[i]!.codePointAt(0)!;
    if (p === q) continue;
    if (lowerRune(p) === lowerRune(q) || upperRune(p) === upperRune(q)) continue;
    return false;
  }
  return true;
}

const printable = /^[\p{L}\p{M}\p{N}\p{P}\p{S} ]$/u;

/** Quotes a string as Go's `%q` verb (`strconv.Quote`) does. */
export function quote(value: string): string {
  let out = '"';
  for (const ch of value) {
    const cp = ch.codePointAt(0)!;
    if (ch === '"' || ch === '\\') out += `\\${ch}`;
    else if (printable.test(ch)) out += ch;
    else if (cp === 7) out += '\\a';
    else if (cp === 8) out += '\\b';
    else if (cp === 12) out += '\\f';
    else if (cp === 10) out += '\\n';
    else if (cp === 13) out += '\\r';
    else if (cp === 9) out += '\\t';
    else if (cp === 11) out += '\\v';
    else if (cp < 0x80) out += `\\x${cp.toString(16).padStart(2, '0')}`;
    else if (cp < 0x10000) out += `\\u${cp.toString(16).padStart(4, '0')}`;
    else out += `\\U${cp.toString(16).padStart(8, '0')}`;
  }
  return `${out}"`;
}

/** The error Go's `path.ErrBadPattern` carries. */
export const badPattern = 'syntax error in pattern';

class BadPattern extends Error {}

function scanChunk(pattern: Uint8Array): [boolean, Uint8Array, Uint8Array] {
  let star = false;
  let p = pattern;
  while (p.length > 0 && p[0] === 0x2a) {
    p = p.subarray(1);
    star = true;
  }
  let inrange = false;
  for (let i = 0; i < p.length; i++) {
    switch (p[i]) {
      case 0x5c:
        if (i + 1 < p.length) i++;
        break;
      case 0x5b:
        inrange = true;
        break;
      case 0x5d:
        inrange = false;
        break;
      case 0x2a:
        if (!inrange) return [star, p.subarray(0, i), p.subarray(i)];
        break;
    }
  }
  return [star, p, new Uint8Array(0)];
}

function getEsc(chunk: Uint8Array): [number, Uint8Array] {
  if (chunk.length === 0 || chunk[0] === 0x2d || chunk[0] === 0x5d) throw new BadPattern(badPattern);
  let c = chunk;
  if (c[0] === 0x5c) {
    c = c.subarray(1);
    if (c.length === 0) throw new BadPattern(badPattern);
  }
  const [r, n] = decodeRune(c);
  let bad = r === runeError && n === 1;
  const next = c.subarray(n);
  if (next.length === 0) bad = true;
  if (bad) throw new BadPattern(badPattern);
  return [r, next];
}

function matchChunk(chunkIn: Uint8Array, sIn: Uint8Array): [Uint8Array, boolean] {
  let chunk = chunkIn;
  let s = sIn;
  let failed = false;
  while (chunk.length > 0) {
    failed = failed || s.length === 0;
    switch (chunk[0]) {
      case 0x5b: {
        let r = 0;
        if (!failed) {
          const [rune, n] = decodeRune(s);
          r = rune;
          s = s.subarray(n);
        }
        chunk = chunk.subarray(1);
        let negated = false;
        if (chunk.length > 0 && chunk[0] === 0x5e) {
          negated = true;
          chunk = chunk.subarray(1);
        }
        let match = false;
        let nrange = 0;
        for (;;) {
          if (chunk.length > 0 && chunk[0] === 0x5d && nrange > 0) {
            chunk = chunk.subarray(1);
            break;
          }
          let lo: number;
          [lo, chunk] = getEsc(chunk);
          let hi = lo;
          if (chunk[0] === 0x2d) [hi, chunk] = getEsc(chunk.subarray(1));
          match = match || (lo <= r && r <= hi);
          nrange++;
        }
        failed = failed || match === negated;
        break;
      }
      case 0x3f:
        if (!failed) {
          failed = s[0] === 0x2f;
          const [, n] = decodeRune(s);
          s = s.subarray(n);
        }
        chunk = chunk.subarray(1);
        break;
      case 0x5c:
        chunk = chunk.subarray(1);
        if (chunk.length === 0) throw new BadPattern(badPattern);
        if (!failed) {
          failed = chunk[0] !== s[0];
          s = s.subarray(1);
        }
        chunk = chunk.subarray(1);
        break;
      default:
        if (!failed) {
          failed = chunk[0] !== s[0];
          s = s.subarray(1);
        }
        chunk = chunk.subarray(1);
    }
  }
  if (failed) return [new Uint8Array(0), false];
  return [s, true];
}

function matchBytes(patternIn: Uint8Array, nameIn: Uint8Array): boolean {
  let pattern = patternIn;
  let name = nameIn;
  outer: while (pattern.length > 0) {
    let star: boolean;
    let chunk: Uint8Array;
    [star, chunk, pattern] = scanChunk(pattern);
    if (star && chunk.length === 0) return !name.includes(0x2f);
    const [t, ok] = matchChunk(chunk, name);
    if (ok && (t.length === 0 || pattern.length > 0)) {
      name = t;
      continue;
    }
    if (star) {
      for (let i = 0; i < name.length && name[i] !== 0x2f; i++) {
        const [rest, matched] = matchChunk(chunk, name.subarray(i + 1));
        if (matched) {
          if (pattern.length === 0 && rest.length > 0) continue;
          name = rest;
          continue outer;
        }
      }
    }
    while (pattern.length > 0) {
      [, chunk, pattern] = scanChunk(pattern);
      matchChunk(chunk, new Uint8Array(0));
    }
    return false;
  }
  return name.length === 0;
}

/** Go's `path.Match`: whether `name` matches the shell pattern, throwing an Error with Go's message when the pattern is malformed. */
export function pathMatch(pattern: string | Uint8Array, name: string | Uint8Array): boolean {
  const p = typeof pattern === 'string' ? utf8(pattern) : pattern;
  const n = typeof name === 'string' ? utf8(name) : name;
  try {
    return matchBytes(p, n);
  } catch (thrown) {
    if (thrown instanceof BadPattern) throw new Error(badPattern);
    throw thrown;
  }
}

/** Go's `path.Base`: the last element of a slash-separated path. */
export function pathBase(path: string): string {
  if (path === '') return '.';
  let p = path;
  while (p.length > 0 && p.endsWith('/')) p = p.slice(0, -1);
  const i = p.lastIndexOf('/');
  if (i >= 0) p = p.slice(i + 1);
  return p === '' ? '/' : p;
}

/** Go's `path.Ext`: the suffix from the final dot of the last element, or "". */
export function pathExt(path: string): string {
  for (let i = path.length - 1; i >= 0 && path[i] !== '/'; i--) {
    if (path[i] === '.') return path.slice(i);
  }
  return '';
}
