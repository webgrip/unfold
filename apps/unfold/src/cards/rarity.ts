import { byteLength, compareStrings, pathMatch, quote, trimSpace, utf8 } from './rarity-go.ts';

/** The paths formula 2026.1 counts as sensitive ground on a Work Target that sets no sensitivePaths (Ploeg `rarity.DefaultSensitivePaths`). */
export const defaultSensitivePaths: readonly string[] = Object.freeze([
  '**/migrations/**',
  '**/*.sql',
  '**/schema*.json',
  '**/*.proto',
  '**/openapi*.{yml,yaml,json}',
  'Dockerfile',
  '**/helm/**',
  '**/.github/workflows/**',
  '**/.forgejo/workflows/**',
]);

/** The paths formula 2026.1 leaves out of counted lines on a Work Target that sets no sizeExclude: lockfiles, generated files and vendored code (Ploeg `rarity.DefaultSizeExclude`). */
export const defaultSizeExclude: readonly string[] = Object.freeze([
  'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb',
  'go.sum', 'go.work.sum', 'Cargo.lock', 'poetry.lock', 'Pipfile.lock', 'uv.lock', 'composer.lock',
  'Gemfile.lock', 'mise.lock', 'flake.lock', 'packages.lock.json',
  '*.pb.go', '*_pb2.py', '*.gen.go', '*_generated.go', 'zz_generated*', '*.min.js', '*.min.css', '*.map', '*.snap',
  '**/__snapshots__/**', '**/generated/**',
  '**/vendor/**', '**/node_modules/**', '**/third_party/**', '**/dist/**',
]);

/** The top-level directories whose children are the modules, as in services/engine or packages/ui. */
export const moduleRoots: readonly string[] = Object.freeze(['apps', 'packages', 'services', 'libs', 'modules', 'crates', 'components', 'plugins', 'projects']);

/** How many patterns one list of rules may hold. */
export const maxPatterns = 100;
/** How long one pattern may be, in UTF-8 bytes. */
export const maxPatternLength = 256;

/** A compiled path pattern (Ploeg `rarity.Pattern`): a pattern without a slash matches the file name at any depth, any other is anchored at the repository root; `**` spans directories, `*`, `?` and `[...]` work within a segment as Go's `path.Match`, `{a,b}` lists alternatives and a trailing slash matches everything below. */
export type Pattern = { readonly alternatives: readonly (readonly string[])[]; match(file: string): boolean };

/** One Work Target's rarity path rules. An absent or null list uses the default; an empty list means none. attentionPaths are always sensitive on top. */
export type RarityRules = { sensitivePaths?: readonly string[] | null; attentionPaths?: readonly string[] | null; sizeExclude?: readonly string[] | null };

/** One changed file and the lines it added and removed; a null count is one the forge did not report (Ploeg `rarity.FileLines`). */
export type FileLines = { path: string; additions?: number | null; deletions?: number | null };

/** The path questions of one set of rarity rules (Ploeg `rarity.Matcher`). */
export type RarityMatcher = {
  sensitive(file: string): boolean;
  excluded(file: string): boolean;
  countedLines(files: readonly FileLines[], total: number | null | undefined, truncated: boolean): number | null;
};

const maxBraceAlternatives = 64;

function expandBraces(raw: string): string[] {
  const open = raw.indexOf('{');
  if (open < 0) {
    if (raw.includes('}')) throw new Error(`pattern ${quote(raw)} has an unmatched }`);
    return [raw];
  }
  const close = raw.indexOf('}', open);
  if (close < 0) throw new Error(`pattern ${quote(raw)} has an unmatched {`);
  const inner = raw.slice(open + 1, close);
  if (inner.includes('{')) throw new Error(`pattern ${quote(raw)} nests braces`);
  const rest = expandBraces(raw.slice(close + 1));
  const out: string[] = [];
  for (const choice of inner.split(',')) {
    for (const tail of rest) {
      out.push(raw.slice(0, open) + choice + tail);
      if (out.length > maxBraceAlternatives) throw new Error(`pattern ${quote(raw)} expands to more than ${maxBraceAlternatives} alternatives`);
    }
  }
  return out;
}

function matchSegments(pattern: readonly Uint8Array[], parts: readonly Uint8Array[], p: number, q: number): boolean {
  if (p === pattern.length) return q === parts.length;
  if (pattern[p] === doubleStar) {
    for (let i = q; i <= parts.length; i++) if (matchSegments(pattern, parts, p + 1, i)) return true;
    return false;
  }
  if (q === parts.length) return false;
  let ok: boolean;
  try {
    ok = pathMatch(pattern[p]!, parts[q]!);
  } catch {
    ok = false;
  }
  return ok && matchSegments(pattern, parts, p + 1, q + 1);
}

const doubleStar = utf8('**');

function splitFile(file: string): Uint8Array[] {
  return (file.startsWith('/') ? file.slice(1) : file).split('/').map(utf8);
}

/** Parses one pattern as Ploeg's `rarity.Compile`, throwing an Error with Go's message when it is malformed. */
export function compilePattern(raw: string): Pattern {
  if (trimSpace(raw) !== raw || raw === '' || byteLength(raw) > maxPatternLength) {
    throw new Error(`pattern ${quote(raw)} must be 1 to ${maxPatternLength} characters without surrounding space`);
  }
  const alternatives: string[][] = [];
  for (let alt of expandBraces(raw)) {
    if (alt.startsWith('/')) alt = alt.slice(1);
    if (alt.endsWith('/')) alt += '**';
    if (!alt.includes('/')) alt = `**/${alt}`;
    const segments = alt.split('/');
    for (const s of segments) {
      if (s === '') throw new Error(`pattern ${quote(raw)} has an empty path segment`);
      if (s === '**') continue;
      if (s.includes('**')) throw new Error(`pattern ${quote(raw)}: ** must be a whole path segment`);
      try {
        pathMatch(s, '');
      } catch (error) {
        throw new Error(`pattern ${quote(raw)}: ${(error as Error).message}`);
      }
    }
    alternatives.push(segments);
  }
  const compiled = alternatives.map(segments => segments.map(s => (s === '**' ? doubleStar : utf8(s))));
  return Object.freeze({
    alternatives: Object.freeze(alternatives.map(segments => Object.freeze(segments))),
    match(file: string): boolean {
      const parts = splitFile(file);
      return compiled.some(alt => matchSegments(alt, parts, 0, 0));
    },
  });
}

/** Compiles one named list of patterns, refusing more than `maxPatterns`, a duplicate or a malformed pattern with Go's messages. */
export function compilePatterns(field: string, patterns: readonly string[]): Pattern[] {
  if (patterns.length > maxPatterns) throw new Error(`${field}: at most ${maxPatterns} patterns, got ${patterns.length}`);
  const seen = new Set<string>();
  const out: Pattern[] = [];
  for (const raw of patterns) {
    if (seen.has(raw)) throw new Error(`${field}: pattern ${quote(raw)} is listed twice`);
    seen.add(raw);
    try {
      out.push(compilePattern(raw));
    } catch (error) {
      throw new Error(`${field}: ${(error as Error).message}`);
    }
  }
  return out;
}

/** Whether any pattern matches file. */
export function matchAny(patterns: readonly Pattern[], file: string): boolean {
  return patterns.some(p => p.match(file));
}

/** Validates one Work Target's rules and returns their matcher, as Ploeg's `rarity.Rules.Compile`. */
export function compileRarityRules(rules: RarityRules = {}): RarityMatcher {
  const sensitive = [
    ...compilePatterns('sensitivePaths', rules.sensitivePaths ?? defaultSensitivePaths),
    ...compilePatterns('attentionPaths', rules.attentionPaths ?? []),
  ];
  const exclude = compilePatterns('sizeExclude', rules.sizeExclude ?? defaultSizeExclude);
  const excluded = (file: string) => matchAny(exclude, file);
  return Object.freeze({
    sensitive: (file: string) => matchAny(sensitive, file),
    excluded,
    countedLines(files: readonly FileLines[], total: number | null | undefined, truncated: boolean): number | null {
      let counted = 0;
      let left = 0;
      let complete = true;
      let anyExcluded = false;
      for (const f of files) {
        const skip = excluded(f.path);
        anyExcluded = anyExcluded || skip;
        if (f.additions == null || f.deletions == null) {
          complete = false;
          continue;
        }
        if (skip) left += f.additions + f.deletions;
        else counted += f.additions + f.deletions;
      }
      if (truncated && total != null) return Math.max(0, total - left);
      if (complete && !truncated) return counted;
      if (!anyExcluded && !truncated && total != null) return total;
      return null;
    },
  });
}

/** The module a repository path belongs to: its top-level directory, or the first two directories under one of `moduleRoots`; a root file belongs to ".". */
export function moduleOf(file: string): string {
  const parts = (file.startsWith('/') ? file.slice(1) : file).split('/');
  if (parts.length === 1) return '.';
  if (parts.length > 2 && moduleRoots.includes(parts[0]!)) return `${parts[0]}/${parts[1]}`;
  return parts[0]!;
}

/** The version of the score, the tier cut-offs and the fixed thresholds. */
export const formula = '2026.1';

/** The most common tier. */
export const tierCommon = 'common';
/** The second tier. */
export const tierUncommon = 'uncommon';
/** The third tier. */
export const tierRare = 'rare';
/** The fourth tier. */
export const tierEpic = 'epic';
/** The rarest tier. */
export const tierLegendary = 'legendary';
/** A rarity tier. */
export type Tier = typeof tierCommon | typeof tierUncommon | typeof tierRare | typeof tierEpic | typeof tierLegendary;

/** The weight of the reach component. */
export const weightReach = 0.3;
/** The weight of the sensitive component. */
export const weightSensitive = 0.25;
/** The weight of the novelty component. */
export const weightNovelty = 0.2;
/** The weight of the size component. */
export const weightSize = 0.25;
/** The reach (modules, plus `repoReach` per repository beyond the first) at which the reach component reaches 1. */
export const reachSaturation = 12;
/** What each repository beyond the first adds to reach. */
export const repoReach = 3;
/** The number of sensitive files at which the sensitive component reaches 1. */
export const sensitiveSaturation = 8;
/** The number of counted lines at which the size component reaches 1. */
export const sizeSaturation = 2000;
/** What a predicted score adds when the card is in an epic's set. */
export const setBonus = 10;
/** How far back, in milliseconds, an earlier merged play must be to make a file it touched no longer novel (180 days). */
export const noveltyWindowMs = 180 * 24 * 60 * 60 * 1000;
/** The number of revealed cards, the card included, a cohort needs before tiers come from percentiles. */
export const minCohort = 30;
/** The least score of legendary while the cohort is small. */
export const thresholdLegendary = 85;
/** The least score of epic while the cohort is small. */
export const thresholdEpic = 70;
/** The least score of rare while the cohort is small. */
export const thresholdRare = 55;
/** The least score of uncommon while the cohort is small. */
export const thresholdUncommon = 35;
/** The percentile a card must exceed to be legendary. */
export const cutLegendary = 99;
/** The percentile a card must exceed to be epic. */
export const cutEpic = 95;
/** The percentile a card must exceed to be rare. */
export const cutRare = 85;
/** The percentile a card must exceed to be uncommon. */
export const cutUncommon = 60;
/** The challenge inputs that have no source yet; they never move a score. */
export const notCollected: readonly string[] = Object.freeze(['complexity', 'estimate']);

/** What a score is computed from; an absent or null fact is unknown and adds nothing. `set` counts on a predicted score only. */
export type Facts = {
  modules?: number | null;
  repos?: number | null;
  sensitiveFiles?: number | null;
  files?: number | null;
  novelFiles?: number | null;
  countedLines?: number | null;
  set?: boolean;
};

/** The four parts of a score, each from 0 to 1, keyed as Go's `encoding/json` writes `rarity.Components`. */
export type Components = { Reach: number; Sensitive: number; Novelty: number; Size: number };

function saturate(x: number): number {
  if (Number.isNaN(x) || x < 0) return 0;
  return Math.min(1, x);
}

function goRoundTo(x: number): number {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

function round1(x: number): number {
  return goRoundTo(x * 10) / 10;
}

/** The score of facts from 0 to 100 to one decimal, and its components, as Ploeg's `rarity.Score`; a predicted score adds `setBonus` when the card is in a set. */
export function score(f: Facts, predicted: boolean): [number, Components] {
  const c: Components = { Reach: 0, Sensitive: 0, Novelty: 0, Size: 0 };
  if (f.modules != null || f.repos != null) {
    let reach = 1;
    if (f.modules != null && f.modules > 1) reach = f.modules;
    if (f.repos != null && f.repos > 1) reach += repoReach * (f.repos - 1);
    c.Reach = saturate(Math.log(reach) / Math.log(reachSaturation));
  }
  if (f.sensitiveFiles != null) c.Sensitive = saturate(Math.log1p(f.sensitiveFiles) / Math.log1p(sensitiveSaturation));
  if (f.files != null && f.novelFiles != null && f.files > 0) c.Novelty = saturate(f.novelFiles / f.files);
  if (f.countedLines != null) c.Size = saturate(Math.log1p(f.countedLines) / Math.log1p(sizeSaturation));
  let total = 100 * (weightReach * c.Reach + weightSensitive * c.Sensitive + weightNovelty * c.Novelty + weightSize * c.Size);
  if (predicted && f.set === true) total += setBonus;
  return [round1(Math.min(100, total)), c];
}

function thresholdTier(s: number): Tier {
  if (s >= thresholdLegendary) return tierLegendary;
  if (s >= thresholdEpic) return tierEpic;
  if (s >= thresholdRare) return tierRare;
  if (s >= thresholdUncommon) return tierUncommon;
  return tierCommon;
}

function percentileTier(p: number): Tier {
  if (p > cutLegendary) return tierLegendary;
  if (p > cutEpic) return tierEpic;
  if (p > cutRare) return tierRare;
  if (p > cutUncommon) return tierUncommon;
  return tierCommon;
}

/** Places a score in a cohort of revealed scores that excludes the card, as Ploeg's `rarity.Tier`: `[tier, percentile, size]`. Below `minCohort` the fixed thresholds decide and the percentile is null; otherwise the tier comes from the unrounded percentile and the percentile is rounded to one decimal. */
export function tier(s: number, cohort: readonly number[]): [Tier, number | null, number] {
  const size = cohort.length + 1;
  if (size < minCohort) return [thresholdTier(s), null, size];
  let below = 0;
  for (const other of cohort) if (other < s) below++;
  const exact = (100 * (below + 1)) / size;
  return [percentileTier(exact), round1(exact), size];
}

/** The calendar quarter in UTC of whole epoch microseconds, as "2026Q4". */
export function quarter(at: number): string {
  const date = new Date(Math.floor(at / 1000));
  return `${date.getUTCFullYear()}Q${Math.trunc(date.getUTCMonth() / 3) + 1}`;
}

/** Whether tier is one of the five tiers. */
export function validTier(value: string): value is Tier {
  return value === tierCommon || value === tierUncommon || value === tierRare || value === tierEpic || value === tierLegendary;
}

/** The distinct values, sorted by UTF-8 bytes as Go's `sort.Strings`. */
export function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareStrings);
}
