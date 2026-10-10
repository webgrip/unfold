import { compareStrings, decodeUtf8, trimChar, trimSpace, utf8 } from './rarity-go.ts';

/** The complexity measure; any change to how a line's level, the indent unit or the totals are computed changes it. */
export const complexityMethod = 'indentation/2026.1';

/** The indent unit of a file whose diff shows no indentation step between 2 and 8 spaces. */
export const defaultIndentUnit = 4;

/** How many hotspots a measured play keeps, so a card can merge its plays' hotspots. */
export const storedHotspots = 10;

/** One file's added indentation complexity. */
export type Hotspot = { path: string; added: number };

/** The indentation complexity of a change, serialized as Ploeg's `playkpi.Complexity` (Hindle, Godfrey and Holt 2008). */
export type Complexity = { method: string; added: number; removed: number; net: number; maxDepth: number; hotspots: Hotspot[] };

/** The longest line, in bytes with its newline, Go's `bufio.Scanner` reads with the 1 MiB buffer Ploeg gives it; a longer line ends the read. */
export const maxDiffLineBytes = 1 << 20;

type DiffFile = { path: string; added: string[]; removed: string[]; sequence: string[] };

/** Sorts hotspots most added first, then by path, as Ploeg does. */
export function sortHotspots(h: Hotspot[]): void {
  h.sort((a, b) => (a.added !== b.added ? b.added - a.added : compareStrings(a.path, b.path)));
}

function scanLines(diff: Uint8Array): string[] {
  const lines: string[] = [];
  let start = 0;
  while (start < diff.length) {
    let end = diff.indexOf(0x0a, start);
    const terminated = end >= 0;
    if (!terminated) end = diff.length;
    if (end - start + 1 > maxDiffLineBytes) break;
    let stop = end;
    if (stop > start && diff[stop - 1] === 0x0d) stop--;
    lines.push(decodeUtf8(diff, start, stop));
    start = terminated ? end + 1 : diff.length;
  }
  return lines;
}

function gitHeaderPath(line: string): string {
  const rest = line.slice('diff --git '.length);
  const i = rest.lastIndexOf(' b/');
  return i >= 0 ? trimChar(rest.slice(i + 3), '"') : '';
}

function diffPath(raw: string): string {
  let s = trimSpace(raw);
  const tab = s.indexOf('\t');
  if (tab >= 0) s = s.slice(0, tab);
  s = trimChar(s, '"');
  if (s === '/dev/null') return '';
  for (const prefix of ['a/', 'b/']) if (s.startsWith(prefix)) return s.slice(prefix.length);
  return s;
}

function parseDiff(diff: Uint8Array): DiffFile[] {
  const files: DiffFile[] = [];
  let cur: DiffFile | null = null;
  let inHunk = false;
  let oldPath = '';
  for (const scanned of scanLines(diff)) {
    const line = scanned.endsWith('\r') ? scanned.slice(0, -1) : scanned;
    if (line.startsWith('diff --git ')) {
      cur = { path: gitHeaderPath(line), added: [], removed: [], sequence: [] };
      files.push(cur);
      inHunk = false;
      oldPath = '';
      continue;
    }
    if (cur === null) continue;
    if (!inHunk && line.startsWith('--- ')) {
      oldPath = diffPath(line.slice(4));
      continue;
    }
    if (!inHunk && line.startsWith('+++ ')) {
      const p = diffPath(line.slice(4));
      if (p !== '') cur.path = p;
      else if (oldPath !== '') cur.path = oldPath;
      continue;
    }
    if (line.startsWith('@@')) {
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith('+')) {
      cur.added.push(line.slice(1));
      cur.sequence.push(line.slice(1));
    } else if (line.startsWith('-')) cur.removed.push(line.slice(1));
    else if (line.startsWith(' ')) cur.sequence.push(line.slice(1));
  }
  return files;
}

function leading(line: string): [number, number, boolean] {
  let tabs = 0;
  let spaces = 0;
  for (const ch of line) {
    if (ch === '\t') {
      if (spaces === 0) tabs++;
      else spaces += defaultIndentUnit;
    } else if (ch === ' ') spaces++;
    else return [tabs, spaces, false];
  }
  return [tabs, spaces, true];
}

function indentLevel(line: string, unit: number): [number, boolean] {
  const [tabs, spaces, blank] = leading(line);
  if (blank) return [0, true];
  return [tabs + Math.trunc(spaces / unit), false];
}

/** The indent unit a file's added and context lines show: the most frequent step of 2 to 8 spaces between space-indented lines, else the smallest such indentation, else `defaultIndentUnit`. */
export function indentUnit(lines: readonly string[]): number {
  const steps = new Map<number, number>();
  let previous = -1;
  let smallest = 0;
  for (const line of lines) {
    const [tabs, spaces, blank] = leading(line);
    if (blank || tabs > 0) continue;
    if (spaces > 0 && (smallest === 0 || spaces < smallest)) smallest = spaces;
    if (previous >= 0) {
      const step = Math.abs(spaces - previous);
      if (step >= 2 && step <= 8) steps.set(step, (steps.get(step) ?? 0) + 1);
    }
    previous = spaces;
  }
  let best = 0;
  let count = 0;
  for (const [step, n] of steps) {
    if (n > count || (n === count && step < best)) {
      best = step;
      count = n;
    }
  }
  if (best > 0) return best;
  if (smallest >= 2 && smallest <= 8) return smallest;
  return defaultIndentUnit;
}

/** Reads a unified diff and returns the indentation complexity of every file `excluded` does not leave out, as Ploeg's `playkpi.MeasureComplexity`. A string diff is read as its UTF-8 bytes. */
export function measureComplexity(diff: string | Uint8Array, excluded?: ((path: string) => boolean) | null): Complexity {
  const c: Complexity = { method: complexityMethod, added: 0, removed: 0, net: 0, maxDepth: 0, hotspots: [] };
  for (const f of parseDiff(typeof diff === 'string' ? utf8(diff) : diff)) {
    if (f.path === '' || (excluded && excluded(f.path))) continue;
    const unit = indentUnit(f.sequence);
    let added = 0;
    for (const line of f.added) {
      const [level, blank] = indentLevel(line, unit);
      if (blank) continue;
      added += level;
      c.maxDepth = Math.max(c.maxDepth, level);
    }
    for (const line of f.removed) {
      const [level, blank] = indentLevel(line, unit);
      if (!blank) c.removed += level;
    }
    c.added += added;
    if (added > 0) c.hotspots.push({ path: f.path, added });
  }
  c.net = c.added - c.removed;
  sortHotspots(c.hotspots);
  if (c.hotspots.length > storedHotspots) c.hotspots = c.hotspots.slice(0, storedHotspots);
  return c;
}

/** One changed file's indentation measurement as Ploeg's delivery facts carry it: the indent unit detected for the file, the summed levels of its non-blank added and removed lines and its deepest added line. */
export type FileIndentation = { method: string; unit: number; added: number; removed: number; maxDepth: number };

/** The indentation measurement of every file in a unified diff, in diff order, as `measureComplexity` counts each one; a file without hunks measures zero and a file without a path is left out. */
export function fileIndentations(diff: string | Uint8Array): { path: string; indentation: FileIndentation }[] {
  const out: { path: string; indentation: FileIndentation }[] = [];
  for (const f of parseDiff(typeof diff === 'string' ? utf8(diff) : diff)) {
    if (f.path === '') continue;
    const unit = indentUnit(f.sequence);
    let added = 0;
    let removed = 0;
    let maxDepth = 0;
    for (const line of f.added) {
      const [level, blank] = indentLevel(line, unit);
      if (blank) continue;
      added += level;
      maxDepth = Math.max(maxDepth, level);
    }
    for (const line of f.removed) {
      const [level, blank] = indentLevel(line, unit);
      if (!blank) removed += level;
    }
    out.push({ path: f.path, indentation: { method: complexityMethod, unit, added, removed, maxDepth } });
  }
  return out;
}

/** The complexity of a change from per-file indentation measurements, or null when a file `excluded` keeps lacks a measurement of `complexityMethod`. */
export function complexityFromFiles(files: readonly { path: string; indentation?: FileIndentation | null }[], excluded?: ((path: string) => boolean) | null): Complexity | null {
  const c: Complexity = { method: complexityMethod, added: 0, removed: 0, net: 0, maxDepth: 0, hotspots: [] };
  for (const f of files) {
    if (f.path === '' || (excluded && excluded(f.path))) continue;
    const m = f.indentation;
    if (!m || m.method !== complexityMethod) return null;
    c.added += m.added;
    c.removed += m.removed;
    c.maxDepth = Math.max(c.maxDepth, m.maxDepth);
    if (m.added > 0) c.hotspots.push({ path: f.path, added: m.added });
  }
  c.net = c.added - c.removed;
  sortHotspots(c.hotspots);
  if (c.hotspots.length > storedHotspots) c.hotspots = c.hotspots.slice(0, storedHotspots);
  return c;
}
