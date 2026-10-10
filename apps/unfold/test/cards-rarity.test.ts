import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  compilePattern, compileRarityRules, maxPatternLength, maxPatterns, minCohort, moduleOf, quarter, score, sortedUnique, tier, validTier,
  weightNovelty, weightReach, weightSensitive, weightSize, type Facts, type FileLines, type RarityRules,
} from '../src/cards/rarity.ts';

test('patterns match as Ploeg rarity.Pattern does', () => {
  const cases: [string, string[], string[]][] = [
    ['**/migrations/**', ['migrations/0001.sql', 'services/engine/pkg/store/migrations/0031_card_rarity.sql'], ['pkg/migration.go', 'docs/migrations.md']],
    ['migrations/**', ['migrations/0001.sql'], ['services/engine/migrations/0001.sql']],
    ['**/*.sql', ['a.sql', 'db/seed/b.sql'], ['a.sqlx', 'sql/readme.md']],
    ['**/schema*.json', ['schema.json', 'docs/contracts/schema-v2.json'], ['docs/schemas/a.json']],
    ['**/openapi*.{yml,yaml,json}', ['openapi.yaml', 'api/openapi-v1.yml', 'api/openapi.json'], ['api/openapi.toml', 'openapi/x.yaml']],
    ['Dockerfile', ['Dockerfile', 'apps/console/Dockerfile'], ['Dockerfile.dev', 'docs/Dockerfile.md']],
    ['**/helm/**', ['ops/helm/ploeg/values.yaml'], ['helmfile.yaml']],
    ['**/.forgejo/workflows/**', ['.forgejo/workflows/on_push.yml'], ['.forgejo/actions/x.yml']],
    ['*.lock', ['yarn.lock', 'deep/Cargo.lock'], ['lock.go']],
    ['ops/', ['ops/a', 'ops/b/c'], ['apps/ops/a']],
    ['/pkg/rarity/*.go', ['pkg/rarity/paths.go'], ['pkg/rarity/sub/x.go', 'apps/pkg/rarity/x.go']],
    ['pkg/store/card_?arity.go', ['pkg/store/card_rarity.go'], ['pkg/store/card_grade.go']],
  ];
  for (const [pattern, match, miss] of cases) {
    const p = compilePattern(pattern);
    for (const f of match) assert.ok(p.match(f), `${pattern} matches ${f}`);
    for (const f of miss) assert.ok(!p.match(f), `${pattern} misses ${f}`);
  }
});

test('compiling refuses bad patterns', () => {
  for (const bad of ['', ' a', 'a//b', 'a**/b', '{a,b', 'a}', '{a,{b}}', '[', 'a'.repeat(maxPatternLength + 1), '{a,b}{c,d}{e,f}{g,h}{i,j}{k,l}{m,n}']) {
    assert.throws(() => compilePattern(bad), Error, `Compile(${JSON.stringify(bad)}) accepted a bad pattern`);
  }
});

test('the default rules mark sensitive and size-excluded paths', () => {
  const m = compileRarityRules({});
  for (const f of ['services/engine/pkg/store/migrations/0031_card_rarity.sql', 'db/schema.json', 'api/v1/service.proto', 'openapi.yaml', 'Dockerfile', 'services/engine/ops/helm/ploeg/values.yaml', '.github/workflows/ci.yml', '.forgejo/workflows/on_push.yml']) {
    assert.ok(m.sensitive(f), `${f} is sensitive by default`);
  }
  for (const f of ['pkg/store/card.go', 'README.md', 'docs/helmet.md']) assert.ok(!m.sensitive(f), `${f} is not sensitive by default`);
  for (const f of ['package-lock.json', 'apps/console/package-lock.json', 'go.sum', 'services/engine/go.sum', 'pnpm-lock.yaml', 'api/v1/service.pb.go', 'vendor/github.com/x/y.go', 'web/node_modules/a/index.js', 'public/app.min.js', 'test/__snapshots__/a.snap', 'mise.lock']) {
    assert.ok(m.excluded(f), `${f} is left out of size by default`);
  }
  for (const f of ['pkg/store/card.go', 'go.mod', 'package.json', 'docs/vendor-notes.md']) assert.ok(!m.excluded(f), `${f} counts in size by default`);
});

test('rules replace the defaults and add attention paths', () => {
  let m = compileRarityRules({ sensitivePaths: [], attentionPaths: ['pkg/store/**', '**/budget*.go'], sizeExclude: ['docs/**'] });
  assert.ok(!m.sensitive('migrations/0001.sql') && m.sensitive('pkg/store/card.go') && m.sensitive('pkg/worker/budget_test.go'), 'an empty sensitivePaths keeps no default; attentionPaths are sensitive');
  assert.ok(!m.excluded('go.sum') && m.excluded('docs/index.md'), 'sizeExclude replaces the default list');
  m = compileRarityRules({ attentionPaths: ['pkg/httpapi/**'] });
  assert.ok(m.sensitive('migrations/0001.sql') && m.sensitive('pkg/httpapi/server.go') && m.excluded('go.sum'), 'attentionPaths add to the defaults');
  const bad: RarityRules[] = [{ attentionPaths: ['a', 'a'] }, { sizeExclude: ['['] }, { sensitivePaths: Array.from({ length: maxPatterns + 1 }, () => '') }];
  for (const rules of bad) assert.throws(() => compileRarityRules(rules), Error);
});

test('a path belongs to its module', () => {
  const cases: Record<string, string> = {
    'README.md': '.',
    'pkg/store/card.go': 'pkg',
    'docs/index.md': 'docs',
    'services/engine/pkg/store/card.go': 'services/engine',
    'apps/README.md': 'apps',
    'packages/ui/src/button.tsx': 'packages/ui',
    'services/api/main.go': 'services/api',
    '/cmd/ploegd/main.go': 'cmd',
    'crates/core/src/lib.rs': 'crates/core',
    'internal/ledger/adr_test.go': 'internal',
    '.forgejo/workflows/on_push.yml': '.forgejo',
  };
  for (const [file, want] of Object.entries(cases)) assert.equal(moduleOf(file), want, file);
});

test('counted lines leave excluded files out', () => {
  const m = compileRarityRules();
  const lock: FileLines = { path: 'go.sum', additions: 40, deletions: 10 };
  const code: FileLines = { path: 'a.go', additions: 12, deletions: 3 };
  const uncounted: FileLines = { path: 'b.go' };
  const cases: [string, FileLines[], number | null, boolean, number | null][] = [
    ['excluded files count nothing', [lock, code], 65, false, 15],
    ['a truncated list takes the excluded lines off the total', [lock], 100, true, 50],
    ['an uncounted file falls back to the total without exclusions', [code, uncounted], 30, false, 30],
    ['an uncounted file next to an excluded one is unknown', [lock, uncounted], 30, false, null],
    ['a truncated list without a total is unknown', [code], null, true, null],
  ];
  for (const [name, files, total, truncated, want] of cases) assert.equal(m.countedLines(files, total, truncated), want, name);
});

test('the score follows formula 2026.1', () => {
  const cases: [string, Facts, boolean, number][] = [
    ['nothing known scores 0', {}, false, 0],
    ['one module, half novel, 50 lines', { modules: 1, repos: 1, sensitiveFiles: 0, files: 10, novelFiles: 5, countedLines: 50 }, false, 22.9],
    ['three modules, a migration, mostly novel, 400 lines', { modules: 3, repos: 1, sensitiveFiles: 1, files: 10, novelFiles: 8, countedLines: 400 }, false, 56.9],
    ['two repositories add three to reach', { modules: 6, repos: 2, sensitiveFiles: 4, files: 10, novelFiles: 9, countedLines: 1500 }, false, 86.9],
    ['every component saturates at 100', { modules: 40, repos: 1, sensitiveFiles: 30, files: 3, novelFiles: 3, countedLines: 90000 }, false, 100],
    ['repositories alone give reach', { repos: 3 }, false, 23.5],
    ['zero counted lines and no novel file add nothing', { modules: 2, repos: 1, sensitiveFiles: 0, files: 4, novelFiles: 0, countedLines: 0 }, false, 8.4],
    ['a set adds 10 to a predicted score', { repos: 1, set: true }, true, 10],
    ['a set never moves a revealed score', { repos: 1, set: true }, false, 0],
    ['a predicted score is capped at 100', { modules: 40, repos: 1, sensitiveFiles: 30, files: 3, novelFiles: 3, countedLines: 90000, set: true }, true, 100],
    ['no files means no novelty', { files: 0, novelFiles: 0 }, false, 0],
  ];
  for (const [name, facts, predicted, want] of cases) {
    const [got, c] = score(facts, predicted);
    assert.ok(Math.abs(got - want) <= 1e-9, `${name}: score ${got}, want ${want}`);
    for (const part of [c.Reach, c.Sensitive, c.Novelty, c.Size]) assert.ok(part >= 0 && part <= 1, `${name}: component ${part} outside 0..1`);
  }
});

test('the score weights sum to one', () => {
  assert.ok(Math.abs(weightReach + weightSensitive + weightNovelty + weightSize - 1) <= 1e-9);
});

test('tiers use the fixed thresholds below the minimum cohort', () => {
  const cohort = new Array<number>(minCohort - 2).fill(0);
  const cases: [number, string][] = [[100, 'legendary'], [85, 'legendary'], [84.9, 'epic'], [70, 'epic'], [69.9, 'rare'], [55, 'rare'], [54.9, 'uncommon'], [35, 'uncommon'], [34.9, 'common'], [0, 'common']];
  for (const [s, want] of cases) assert.deepEqual(tier(s, cohort), [want, null, minCohort - 1], `Tier(${s})`);
});

test('tiers use percentiles from the minimum cohort', () => {
  const cohort = Array.from({ length: 99 }, (_, i) => i);
  const cases: [number, string, number][] = [[1000, 'legendary', 100], [98, 'epic', 99], [94.5, 'epic', 96], [94, 'rare', 95], [84.5, 'rare', 86], [84, 'uncommon', 85], [59.5, 'uncommon', 61], [59, 'common', 60], [-1, 'common', 1]];
  for (const [s, wantTier, percentile] of cases) assert.deepEqual(tier(s, cohort), [wantTier, percentile, 100], `Tier(${s})`);
  assert.deepEqual(tier(0, new Array<number>(minCohort - 1).fill(0)), ['common', Math.round((100 / minCohort) * 10) / 10, minCohort], 'a tie never lifts a card');
  assert.equal(tier(50, [...new Array<number>(minCohort - 2).fill(0), 10])[0], 'legendary', 'the top card of the smallest percentile cohort');
});

test('the quarter is the UTC calendar quarter', () => {
  const cases: [string, string][] = [
    ['2026-01-01T00:00:00Z', '2026Q1'],
    ['2026-03-31T23:59:00Z', '2026Q1'],
    ['2026-04-01T00:00:00Z', '2026Q2'],
    ['2026-10-02T09:00:00Z', '2026Q4'],
    ['2027-01-01T00:30:00+01:00', '2026Q4'],
    ['2026-12-31T23:30:00-02:00', '2027Q1'],
  ];
  for (const [at, want] of cases) assert.equal(quarter(Date.parse(at)), want, at);
});

test('validTier and sortedUnique', () => {
  for (const t of ['common', 'uncommon', 'rare', 'epic', 'legendary']) assert.ok(validTier(t));
  for (const t of ['', 'Rare', 'mythic']) assert.ok(!validTier(t));
  assert.deepEqual(sortedUnique(['b', 'a', 'b', 'é', 'z', '\u{1F600}', '�']), ['a', 'b', 'z', 'é', '�', '\u{1F600}']);
});

type Golden = { name: string; kind: string; input: Record<string, unknown>; output: unknown };

const fixtureDirectory = new URL('./fixtures/cards/rarity/', import.meta.url);

function rarityOutput(kind: string, input: Record<string, unknown>): unknown {
  const attempt = (run: () => unknown) => {
    try {
      return { value: run(), error: null };
    } catch (error) {
      return { value: null, error: (error as Error).message };
    }
  };
  switch (kind) {
    case 'match':
      return attempt(() => {
        const p = compilePattern(input.pattern as string);
        return (input.files as string[]).map(f => p.match(f));
      });
    case 'rules':
      return attempt(() => {
        const m = compileRarityRules(input.rules as RarityRules);
        const files = input.files as string[];
        return { excluded: files.map(f => m.excluded(f)), sensitive: files.map(f => m.sensitive(f)) };
      });
    case 'counted': {
      const m = compileRarityRules(input.rules as RarityRules);
      return m.countedLines(input.files as FileLines[], input.total as number | null, input.truncated as boolean);
    }
    case 'module':
      return (input.files as string[]).map(moduleOf);
    case 'score': {
      const [s, components] = score(input.facts as Facts, input.predicted as boolean);
      return { components, score: s };
    }
    case 'tier': {
      const [t, percentile, size] = tier(input.score as number, input.cohort as number[]);
      return { percentile, size, tier: t };
    }
    case 'quarter':
      return (input.times as string[]).map(at => quarter(Date.parse(at)));
    case 'sortedUnique':
      return sortedUnique(input.values as string[]);
    default:
      throw new Error(`unknown fixture kind ${kind}`);
  }
}

test('golden fixtures written by the real Go rarity package match', () => {
  const names = readdirSync(fixtureDirectory).filter(name => name.endsWith('.json')).sort();
  assert.ok(names.length > 0, 'fixtures exist');
  let cases = 0;
  for (const name of names) {
    const fixtures = JSON.parse(readFileSync(new URL(name, fixtureDirectory), 'utf8')) as Golden[];
    for (const fixture of fixtures) {
      cases++;
      const got = JSON.parse(JSON.stringify(rarityOutput(fixture.kind, fixture.input)));
      assert.equal(JSON.stringify(got), JSON.stringify(fixture.output), `${name}: ${fixture.name}`);
    }
  }
  assert.ok(cases > 0);
});
