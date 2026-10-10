import { goRound, rfc3339 } from './go.ts';
import { compareStrings, pathBase, pathExt, toLower } from './rarity-go.ts';
import { compilePatterns, matchAny, type FileLines, type Pattern, type RarityMatcher } from './rarity.ts';
import { measureComplexity, type Complexity } from './playkpi-complexity.ts';

/** The paths a Work Target that sets no testPaths counts as tests (Ploeg `playkpi.DefaultTestPaths`). */
export const defaultTestPaths: readonly string[] = Object.freeze([
  '**/test/**', '**/tests/**', '**/__tests__/**', '**/spec/**', '**/testdata/**',
  '*_test.go', 'test_*.py', '*_test.py',
  '*.test.{js,jsx,ts,tsx,mjs,cjs}', '*.spec.{js,jsx,ts,tsx,mjs,cjs}',
  '*Test.java', '*Tests.java', '*Test.kt', '*Test.php', '*Test.cs', '*Tests.cs', '*_spec.rb', '*_test.exs',
]);

/** The paths a Work Target that sets no docPaths counts as documentation (Ploeg `playkpi.DefaultDocPaths`). */
export const defaultDocPaths: readonly string[] = Object.freeze(['**/docs/**', '**/doc/**', '*.md', '*.mdx', '*.rst', '*.adoc', 'README*', 'CHANGELOG*']);

/** One Work Target's change-shape path rules (ADR-0058); an absent or null list uses the default, an empty list means none. */
export type ShapeRules = { testPaths?: readonly string[] | null; docPaths?: readonly string[] | null };

/** The change-shape path questions of one set of rules (Ploeg `playkpi.Matcher`). */
export type ShapeMatcher = { test(file: string): boolean; doc(file: string): boolean };

/** Validates change-shape rules in the rarity path syntax and returns their matcher, as Ploeg's `playkpi.Rules.Compile`. */
export function compileShapeRules(rules: ShapeRules = {}): ShapeMatcher {
  const tests: Pattern[] = compilePatterns('testPaths', rules.testPaths ?? defaultTestPaths);
  const docs: Pattern[] = compilePatterns('docPaths', rules.docPaths ?? defaultDocPaths);
  return Object.freeze({ test: (file: string) => matchAny(tests, file), doc: (file: string) => matchAny(docs, file) });
}

/** The matcher of the default change-shape rules. */
export const defaultShapeMatcher: ShapeMatcher = compileShapeRules();

/** One language a change touched and the lines it added and removed in it. */
export type Language = { name: string; lines: number };

/** How many hotspots a play's card shows. */
export const shownHotspots = 3;
/** How many languages a card shows. */
export const shownLanguages = 3;
/** How many languages a measured play keeps. */
export const storedLanguages = 20;

/** How large, tested and complex a merged play's change was, serialized as Ploeg's `playkpi.Shape` (ADR-0058). */
export type Shape = {
  complexity: Complexity | null;
  files: number;
  countedLines: number | null;
  testLines: number | null;
  testRatio: number | null;
  docsTouched: number;
  languages: Language[];
  truncated: boolean;
  capturedAt: string;
};

/** What measuring a merged play takes (Ploeg `playkpi.MeasureInput`): its changed files with their lines, its whole diff size or null, its unified diff (null when it was not read; an empty diff is a read diff) and the Work Target's size and shape matchers; capturedAt is epoch milliseconds, absent for Go's zero time. */
export type MeasureInput = {
  files?: readonly FileLines[] | null;
  filesTruncated?: boolean;
  total?: number | null;
  diff?: string | Uint8Array | null;
  diffTruncated?: boolean;
  size: RarityMatcher;
  paths: ShapeMatcher;
  capturedAt?: number | null;
};

const zeroTime = -62135596800000;

/** The languages with the most lines first, then by name, at most n. */
export function topLanguages(lines: ReadonlyMap<string, number>, n: number): Language[] {
  const out = [...lines].map(([name, l]) => ({ name, lines: l }));
  out.sort((a, b) => (a.lines !== b.lines ? b.lines - a.lines : compareStrings(a.name, b.name)));
  return out.length > n ? out.slice(0, n) : out;
}

/** A play's Shape as Ploeg's `playkpi.Measure` computes it, keeping up to `storedHotspots` hotspots and `storedLanguages` languages. */
export function measure(input: MeasureInput): Shape {
  const files = input.files ?? [];
  const filesTruncated = input.filesTruncated === true;
  const countedLines = input.size.countedLines(files, input.total, filesTruncated);
  let fileCount = 0;
  let docsTouched = 0;
  let tests = 0;
  let known = !filesTruncated;
  const languages = new Map<string, number>();
  for (const f of files) {
    if (input.size.excluded(f.path)) continue;
    fileCount++;
    if (input.paths.doc(f.path)) docsTouched++;
    if (f.additions == null || f.deletions == null) {
      known = false;
      continue;
    }
    const lines = f.additions + f.deletions;
    if (input.paths.test(f.path)) tests += lines;
    const name = languageOf(f.path);
    if (name !== '' && lines > 0) languages.set(name, (languages.get(name) ?? 0) + lines);
  }
  let testLines: number | null = null;
  let testRatio: number | null = null;
  if (known && countedLines !== null) {
    testLines = tests;
    const rest = countedLines - tests;
    if (rest > 0) testRatio = goRound((tests / rest) * 1000) / 1000;
  }
  return {
    complexity: input.diff == null ? null : measureComplexity(input.diff, input.size.excluded),
    files: fileCount,
    countedLines,
    testLines,
    testRatio,
    docsTouched,
    languages: topLanguages(languages, storedLanguages),
    truncated: filesTruncated || input.diffTruncated === true,
    capturedAt: rfc3339(input.capturedAt ?? zeroTime),
  };
}

/** A Shape trimmed to `shownHotspots` hotspots and `shownLanguages` languages, as Ploeg's `Shape.Shown`. */
export function shownShape(s: Shape): Shape {
  return {
    ...s,
    complexity: s.complexity === null ? null : { ...s.complexity, hotspots: s.complexity.hotspots?.slice(0, shownHotspots) ?? s.complexity.hotspots },
    languages: s.languages?.slice(0, shownLanguages) ?? s.languages,
  };
}

const languageByExtension: Readonly<Record<string, string>> = Object.freeze({
  '.go': 'Go', '.ts': 'TypeScript', '.tsx': 'TypeScript', '.mts': 'TypeScript', '.cts': 'TypeScript',
  '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.py': 'Python', '.rb': 'Ruby', '.java': 'Java', '.kt': 'Kotlin', '.kts': 'Kotlin', '.scala': 'Scala',
  '.cs': 'C#', '.fs': 'F#', '.php': 'PHP', '.rs': 'Rust', '.c': 'C', '.h': 'C',
  '.cc': 'C++', '.cpp': 'C++', '.cxx': 'C++', '.hpp': 'C++', '.swift': 'Swift', '.m': 'Objective-C',
  '.dart': 'Dart', '.ex': 'Elixir', '.exs': 'Elixir', '.erl': 'Erlang', '.hs': 'Haskell', '.lua': 'Lua',
  '.r': 'R', '.jl': 'Julia', '.clj': 'Clojure', '.ml': 'OCaml', '.zig': 'Zig', '.nix': 'Nix',
  '.sh': 'Shell', '.bash': 'Shell', '.zsh': 'Shell', '.ps1': 'PowerShell', '.sql': 'SQL',
  '.html': 'HTML', '.htm': 'HTML', '.css': 'CSS', '.scss': 'SCSS', '.sass': 'SCSS', '.less': 'Less',
  '.vue': 'Vue', '.svelte': 'Svelte', '.astro': 'Astro', '.tf': 'HCL', '.hcl': 'HCL', '.proto': 'Protocol Buffers',
  '.graphql': 'GraphQL', '.gql': 'GraphQL', '.md': 'Markdown', '.mdx': 'Markdown', '.rst': 'reStructuredText',
  '.adoc': 'AsciiDoc', '.yaml': 'YAML', '.yml': 'YAML', '.json': 'JSON', '.toml': 'TOML', '.xml': 'XML',
  '.gradle': 'Gradle', '.twig': 'Twig', '.blade.php': 'Blade',
});

const languageByName: Readonly<Record<string, string>> = Object.freeze({ Dockerfile: 'Dockerfile', Makefile: 'Makefile', Containerfile: 'Dockerfile', Justfile: 'Just' });

/** The language of a file from its name or extension, the lowercased extension itself when it is not in the table, and "" for a file without one (Ploeg `playkpi.LanguageOf`). */
export function languageOf(file: string): string {
  const base = pathBase(file);
  if (Object.hasOwn(languageByName, base)) return languageByName[base]!;
  const lower = toLower(base);
  if (lower.endsWith('.blade.php')) return languageByExtension['.blade.php']!;
  const ext = pathExt(lower);
  if (ext === '' || ext === lower) return '';
  if (Object.hasOwn(languageByExtension, ext)) return languageByExtension[ext]!;
  return ext;
}
