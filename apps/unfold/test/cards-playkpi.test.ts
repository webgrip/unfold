import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { rfc3339 } from '../src/cards/go.ts';
import { compileRarityRules, type FileLines, type RarityRules } from '../src/cards/rarity.ts';
import {
  compileShapeRules, complexityMethod, defaultIndentUnit, defaultShapeMatcher, derive, indentUnit, kindComment, kindForcePush, kindPush, kindReady,
  kindReview, kindReviewComment, languageOf, measure, measureComplexity, shownShape, summarize,
  type Job, type Play, type PlayFigures, type Shape, type ShapeRules,
} from '../src/cards/playkpi.ts';

const t0 = Date.UTC(2026, 9, 1, 9, 0, 0);
const at = (minutes: number) => t0 + minutes * 60_000;
const iso = (minutes: number) => rfc3339(at(minutes));
const notBot = (login: string) => login !== '' && login.toLowerCase() !== 'ploeg-bot';

test('timeline: a draft then ready measures from readiness', () => {
  const p: Play = {
    openedAt: at(0), author: 'ploeg-bot', draft: false, mergedAt: at(300), activityCapturedAt: at(301), commits: 3, firstCommitAt: at(-60), forcePushes: 0,
    events: [
      { kind: kindPush, actor: 'ploeg-bot', at: at(0), headSha: 'a' },
      { kind: kindReady, actor: 'ploeg-bot', at: at(30) },
      { kind: kindComment, actor: 'anna', at: at(90) },
      { kind: kindReview, actor: 'anna', at: at(120), state: 'approved', headSha: 'a' },
    ],
    reviews: [{ reviewer: 'anna', state: 'approved', headSha: 'a', at: at(120) }],
  };
  const [tl] = derive(p, notBot);
  assert.ok(tl);
  assert.equal(tl.readyAt, iso(30), 'a draft is ready when it leaves draft');
  assert.equal(tl.toFirstFeedbackSeconds, 60 * 60);
  assert.equal(tl.toFirstApprovalSeconds, 90 * 60);
  assert.equal(tl.approvalToMergeSeconds, 180 * 60);
  assert.equal(tl.openToMergeSeconds, 300 * 60);
  assert.equal(tl.codingSeconds, 90 * 60);
  assert.ok(tl.reviewRounds === 1 && tl.reviewers === 1 && tl.comments === 1 && tl.commits === 3 && tl.forcePushes === 0, JSON.stringify(tl));
});

test('timeline: never draft is ready at opening', () => {
  const [tl] = derive({ openedAt: at(0), activityCapturedAt: at(5), events: [{ kind: kindReviewComment, actor: 'bob', at: at(15) }] }, notBot);
  assert.equal(tl?.readyAt, iso(0));
  assert.equal(tl?.toFirstFeedbackSeconds, 15 * 60);
});

test('timeline: opened as draft and never ready has no readiness', () => {
  const [tl] = derive({ openedAt: at(0), draft: true, activityCapturedAt: at(5), events: [{ kind: kindComment, actor: 'bob', at: at(15) }] }, notBot);
  assert.ok(tl && tl.readyAt === null && tl.toFirstFeedbackSeconds === null, 'a draft that never became ready has no readiness');
  assert.equal(tl.firstFeedbackAt, iso(15));
});

test('timeline: bots and the author are not feedback', () => {
  const [tl] = derive({
    openedAt: at(0), author: 'carol', activityCapturedAt: at(1),
    events: [
      { kind: kindComment, actor: 'ploeg-bot', at: at(1) },
      { kind: kindComment, actor: 'CAROL', at: at(2) },
      { kind: kindReviewComment, actor: 'carol', at: at(3) },
      { kind: kindReview, actor: 'ploeg-bot', at: at(4), state: 'approved' },
      { kind: kindComment, actor: '', at: at(5) },
      { kind: kindComment, actor: 'dave', at: at(40) },
    ],
    reviews: [{ reviewer: 'ploeg-bot', state: 'approved', at: at(4) }],
  }, notBot);
  assert.ok(tl && tl.firstFeedbackAt === iso(40) && tl.comments === 1 && tl.firstApprovalAt === null && tl.reviewers === 0, 'only dave’s comment is feedback');
  assert.equal(tl.reviewRounds, 0, 'a bot review is no round');
});

test('timeline: response is the median wait for the author’s next push', () => {
  const [tl] = derive({
    openedAt: at(0), author: 'ploeg-bot', activityCapturedAt: at(500),
    events: [
      { kind: kindPush, actor: 'ploeg-bot', at: at(0), headSha: 'a' },
      { kind: kindReview, actor: 'anna', at: at(10), state: 'changes_requested', headSha: 'a' },
      { kind: kindPush, actor: 'anna', at: at(12), headSha: 'x' },
      { kind: kindPush, actor: 'ploeg-bot', at: at(40), headSha: 'b' },
      { kind: kindForcePush, actor: 'ploeg-bot', at: at(100), headSha: 'c' },
    ],
    reviews: [
      { reviewer: 'anna', state: 'changes_requested', headSha: 'a', at: at(10) },
      { reviewer: 'bob', state: 'changes_requested', headSha: 'b', at: at(50) },
      { reviewer: 'anna', state: 'approved', headSha: 'c', at: at(110) },
    ],
  }, notBot);
  assert.equal(tl?.responseSeconds, (30 * 60 + 50 * 60) / 2);
  assert.ok(tl.reviewRounds === 3 && tl.reviewers === 2);
});

test('timeline: without activity only reviews are known', () => {
  const [tl, ci] = derive({ openedAt: at(0), mergedAt: at(60), reviews: [{ reviewer: 'anna', state: 'approved', headSha: 'a', at: at(20) }] }, notBot);
  assert.equal(ci, null, 'CI never read stays unknown');
  assert.ok(tl && tl.comments === null && tl.commits === null && tl.forcePushes === null && tl.readyAt === null && tl.responseSeconds === null && tl.capturedAt === null);
  assert.ok(tl.firstApprovalAt !== null && tl.toFirstApprovalSeconds === null);
  assert.equal(tl.openToMergeSeconds, 3600);
  assert.equal(tl.approvalToMergeSeconds, 2400);
  assert.equal(derive({}, notBot)[0], null, 'the timeline of nothing');
});

test('timeline: an approval after the merge is not the last approval', () => {
  const [tl] = derive({ openedAt: at(0), mergedAt: at(60), reviews: [
    { reviewer: 'anna', state: 'approved', at: at(10) },
    { reviewer: 'bob', state: 'approved', at: at(30) },
    { reviewer: 'carl', state: 'approved', at: at(90) },
  ] }, notBot);
  assert.equal(tl?.firstApprovalAt, iso(10));
  assert.equal(tl?.lastApprovalAt, iso(30));
});

const job = (name: string, status: string, start: number, end: number, attempt: number, queuedSeconds: number | null = null): Job => ({ name, status, startedAt: at(start), completedAt: at(end), attempt, queuedSeconds });

test('CI counts runs, failures, reruns, queue and the slowest jobs', () => {
  const [, ci] = derive({
    openedAt: at(0), headSha: 'b', ciCapturedAt: at(200), ciSource: 'actions', activityCapturedAt: at(200),
    events: [{ kind: kindPush, at: at(0), headSha: 'a' }, { kind: kindPush, at: at(30), headSha: 'b' }],
    runs: [
      { id: '1', sha: 'a', workflow: 'ci.yml', status: 'failure', createdAt: at(0), startedAt: at(2), completedAt: at(10), jobs: [job('test', 'failure', 2, 10, 1, 120), job('lint', 'success', 2, 4, 1, 60)] },
      { id: '2', sha: 'b', workflow: 'ci.yml', status: 'failure', createdAt: at(30), startedAt: at(31), completedAt: at(40), jobs: [job('test', 'failure', 31, 40, 1, 60)] },
      { id: '3', sha: 'b', workflow: 'ci.yml', status: 'success', createdAt: at(50), startedAt: at(51), completedAt: at(63), jobs: [job('test', 'failure', 51, 55, 1), job('test', 'success', 56, 63, 2, 30), job('build', 'success', 51, 61, 1)] },
    ],
  }, notBot);
  assert.ok(ci);
  assert.ok(ci.runs === 3 && ci.failedRuns === 2 && ci.reruns === 2, 'a second run and a second attempt on b are reruns');
  assert.equal(ci.queueSeconds, 270);
  assert.equal(ci.lastGreenSeconds, 12 * 60);
  assert.equal(ci.timeToGreenSeconds, 63 * 60);
  assert.equal(ci.minutes, 40, '8+2+9+4+7+10');
  assert.deepEqual(ci.slowest, [{ name: 'build', seconds: 600 }, { name: 'test', seconds: 540 }, { name: 'lint', seconds: 120 }]);
  assert.equal(ci.firstPassGreen, false, 'the first run on the ready head failed');
});

test('CI: first-pass green needs no rerun', () => {
  const base: Play = { openedAt: at(0), headSha: 'a', ciCapturedAt: at(100), activityCapturedAt: at(100), events: [{ kind: kindPush, at: at(0), headSha: 'a' }] };
  const [, green] = derive({ ...base, runs: [{ id: '1', sha: 'a', status: 'success', createdAt: at(1), startedAt: at(1), completedAt: at(5), jobs: [job('test', 'success', 1, 5, 1)] }] }, notBot);
  assert.ok(green?.firstPassGreen === true && green.timeToGreenSeconds === 300, 'a clean first run is a first-pass green');
  const [, rerun] = derive({ ...base, runs: [{ id: '1', sha: 'a', status: 'success', createdAt: at(1), startedAt: at(3), completedAt: at(6), jobs: [job('test', 'failure', 1, 2, 1), job('test', 'success', 3, 6, 2)] }] }, notBot);
  assert.ok(rerun?.firstPassGreen === false && rerun.reruns === 1, 'a run that needed a rerun is not first-pass green');
  const [, running] = derive({ ...base, runs: [{ id: '1', sha: 'a', status: 'running', createdAt: at(1) }] }, notBot);
  assert.ok(running?.firstPassGreen === null && running.timeToGreenSeconds === null && running.lastGreenSeconds === null, 'a running first run says nothing yet');
});

test('CI: green needs every workflow of a head', () => {
  const [, ci] = derive({
    openedAt: at(0), headSha: 'b', ciCapturedAt: at(100), activityCapturedAt: at(100),
    runs: [
      { id: '1', sha: 'a', workflow: 'ci.yml', status: 'success', createdAt: at(1), startedAt: at(1), completedAt: at(5) },
      { id: '2', sha: 'a', workflow: 'lint.yml', status: 'failure', createdAt: at(1), startedAt: at(1), completedAt: at(3) },
      { id: '3', sha: 'b', workflow: 'ci.yml', status: 'success', createdAt: at(10), startedAt: at(10), completedAt: at(14) },
      { id: '4', sha: 'b', workflow: 'lint.yml', status: 'success', createdAt: at(10), startedAt: at(10), completedAt: at(20) },
    ],
  }, notBot);
  assert.equal(ci?.timeToGreenSeconds, 20 * 60);
  assert.ok(ci.reruns === 0 && ci.queueSeconds === null && ci.minutes === null && ci.slowest.length === 0, 'two workflows on one commit are not reruns, and runs without jobs time nothing');
});

test('CI: no runs is a known zero', () => {
  const [, ci] = derive({ openedAt: at(0), ciCapturedAt: at(1), ciSource: 'statuses' }, notBot);
  assert.ok(ci && ci.runs === 0 && ci.failedRuns === 0 && ci.firstPassGreen === null && Array.isArray(ci.slowest) && ci.source === 'statuses');
});

const fileDiff = (path: string, ...body: string[]) => `diff --git a/${path} b/${path}\nindex 1111111..2222222 100644\n--- a/${path}\n+++ b/${path}\n@@ -1,3 +1,6 @@\n${body.join('\n')}\n`;

test('complexity: tabs count one level each', () => {
  const c = measureComplexity(fileDiff('main.go', ' func main() {', '+\tif ok {', '+\t\tfor {', '+\t\t\trun()', '+\t\t}', '+\t}', '+', ' }'));
  assert.ok(c.added === 9 && c.removed === 0 && c.maxDepth === 3 && c.net === 9 && c.method === complexityMethod, JSON.stringify(c));
  assert.deepEqual(c.hotspots, [{ path: 'main.go', added: 9 }]);
});

test('complexity: spaces are normalised by the detected unit', () => {
  const four = measureComplexity(fileDiff('app.py', ' def f():', '+    if x:', '+        return 1', '+    return 2'));
  const two = measureComplexity(fileDiff('app.ts', ' function f() {', '+  if (x) {', '+    return 1', '+  }', '+  return 2'));
  assert.ok(four.added === 4 && four.maxDepth === 2, JSON.stringify(four));
  assert.ok(two.added === 5 && two.maxDepth === 2, JSON.stringify(two));
});

test('complexity: an aligned continuation does not halve the unit', () => {
  const c = measureComplexity(fileDiff('app.py', ' def f():', '+    if x:', '+        call(a,', '+              b)', '+        return 1', '+    return 2'));
  assert.ok(c.maxDepth === 3 && c.added === 9, JSON.stringify(c));
});

test('complexity: leaves excluded files out', () => {
  const c = measureComplexity(fileDiff('go.sum', '+    deep line') + fileDiff('pkg/a.go', '+\tx := 1'), p => p === 'go.sum');
  assert.ok(c.added === 1 && c.hotspots.length === 1 && c.hotspots[0]!.path === 'pkg/a.go', JSON.stringify(c));
});

test('complexity: a truncated diff counts what arrived', () => {
  const full = fileDiff('a.go', '+\tone', '+\t\ttwo') + fileDiff('b.go', '+\tthree');
  const cut = full.slice(0, full.indexOf('diff --git a/b.go') + 'diff --git a/b.go b/b.go\n--- a/b.go\n'.length);
  const c = measureComplexity(cut);
  assert.ok(c.added === 3 && c.hotspots.length === 1, 'the cut file counts nothing, the whole one counts');
});

test('complexity: a deleted-only diff has a negative net', () => {
  const diff = 'diff --git a/old.go b/old.go\ndeleted file mode 100644\nindex 1111111..0000000\n--- a/old.go\n+++ /dev/null\n@@ -1,4 +0,0 @@\n-func old() {\n-\tif x {\n-\t\ty()\n-\t}\n';
  const c = measureComplexity(diff);
  assert.ok(c.added === 0 && c.removed === 4 && c.net === -4 && c.maxDepth === 0 && c.hotspots.length === 0, JSON.stringify(c));
  assert.equal(measureComplexity(diff, p => p === 'old.go').removed, 0, 'a deleted file is named by its old path');
});

test('complexity: binary and header lines count nothing', () => {
  const diff = 'diff --git a/logo.png b/logo.png\nnew file mode 100644\nindex 0000000..1111111\nBinary files /dev/null and b/logo.png differ\n' + fileDiff('x.go', '+++counter', '---decrement');
  const c = measureComplexity(diff);
  assert.ok(c.added === 0 && c.removed === 0 && c.hotspots.length === 0, JSON.stringify(c));
});

test('the indent unit', () => {
  const cases: [string[], number][] = [
    [['a', '  b', '    c', '  d'], 2],
    [['a', '    b', '        c'], 4],
    [['a', '   b', '      c'], 3],
    [['            only'], defaultIndentUnit],
    [['\tx', '\t\ty'], defaultIndentUnit],
    [['x', '  y'], 2],
  ];
  for (const [lines, want] of cases) assert.equal(indentUnit(lines), want, JSON.stringify(lines));
});

const lines = (path: string, additions: number, deletions: number): FileLines => ({ path, additions, deletions });

test('measure: test ratio, docs, languages and excluded files', () => {
  const capturedAt = Date.UTC(2026, 9, 2, 8, 0, 0);
  const s = measure({
    files: [lines('pkg/store/card.go', 80, 20), lines('pkg/store/card_test.go', 40, 10), lines('web/src/card.spec.ts', 10, 0), lines('docs/concepts/run-cards.md', 30, 5), lines('README.md', 1, 1), lines('go.sum', 500, 400)],
    diff: fileDiff('pkg/store/card.go', '+\tif x {', '+\t\ty()', '+\t}') + fileDiff('go.sum', '+\t\t\t\tdeep'),
    size: compileRarityRules(), paths: defaultShapeMatcher, capturedAt,
  });
  assert.ok(s.files === 5 && s.countedLines === 197 && s.docsTouched === 2, 'go.sum counts for nothing');
  assert.ok(s.testLines === 60 && s.testRatio === 0.438, 'want 60 test lines over 137 others');
  assert.deepEqual(s.languages, [{ name: 'Go', lines: 150 }, { name: 'Markdown', lines: 37 }, { name: 'TypeScript', lines: 10 }]);
  assert.ok(s.complexity?.added === 4 && !s.truncated && s.capturedAt === '2026-10-02T08:00:00Z');
});

test('measure: unknown lines and no diff stay null', () => {
  const s = measure({ files: [lines('a.go', 3, 1), { path: 'b_test.go' }], size: compileRarityRules(), paths: defaultShapeMatcher });
  assert.ok(s.testLines === null && s.testRatio === null && s.countedLines === null && s.complexity === null && s.files === 2, 'a file without line counts leaves the line figures unknown');
  const truncated = measure({ files: [lines('a.go', 3, 1)], filesTruncated: true, total: 40, diff: '', diffTruncated: true, size: compileRarityRules(), paths: defaultShapeMatcher });
  assert.ok(truncated.truncated && truncated.testLines === null && truncated.countedLines === 40 && truncated.complexity?.added === 0, JSON.stringify(truncated));
  const onlyTests = measure({ files: [lines('a_test.go', 3, 1)], size: compileRarityRules(), paths: defaultShapeMatcher });
  assert.ok(onlyTests.testRatio === null && onlyTests.testLines === 4, 'a ratio over zero other lines is unknown');
});

test('shape rules: defaults, replacements and refusals', () => {
  const cases: [string, boolean, boolean][] = [
    ['pkg/store/card_test.go', true, false],
    ['tests/e2e/run.py', true, false],
    ['src/__tests__/card.tsx', true, false],
    ['src/card.test.ts', true, false],
    ['src/main/java/CardTest.java', true, false],
    ['pkg/store/testdata/fixture.json', true, false],
    ['docs/index.md', false, true],
    ['services/engine/docs/adrs/0058.md', false, true],
    ['README', false, true],
    ['CHANGELOG.md', false, true],
    ['pkg/store/card.go', false, false],
    ['contest/main.go', false, false],
  ];
  for (const [path, isTest, isDoc] of cases) assert.deepEqual([defaultShapeMatcher.test(path), defaultShapeMatcher.doc(path)], [isTest, isDoc], path);
  const m = compileShapeRules({ testPaths: ['qa/**'], docPaths: [] });
  assert.ok(m.test('qa/smoke.sh') && !m.test('a_test.go') && !m.doc('README.md'), 'configured rules replace the defaults, and an empty list means none');
  const bad: ShapeRules[] = [{ testPaths: ['a/**b'] }, { docPaths: ['x', 'x'] }, { testPaths: [' spaced'] }];
  for (const rules of bad) assert.throws(() => compileShapeRules(rules), Error);
});

test('the language of a file', () => {
  const cases: Record<string, string> = { 'a/b.go': 'Go', 'x.TSX': 'TypeScript', Dockerfile: 'Dockerfile', 'views/a.blade.php': 'Blade', 'a.weird': '.weird', Makefile: 'Makefile', LICENSE: '', '.gitignore': '' };
  for (const [path, want] of Object.entries(cases)) assert.equal(languageOf(path), want, path);
});

test('shown trims to three', () => {
  const s = { languages: [{ name: 'a', lines: 4 }, { name: 'b', lines: 3 }, { name: 'c', lines: 2 }, { name: 'd', lines: 1 }], complexity: { method: '', added: 0, removed: 0, net: 0, maxDepth: 0, hotspots: [{ path: 'a', added: 4 }, { path: 'b', added: 3 }, { path: 'c', added: 2 }, { path: 'd', added: 1 }] } } as Shape;
  const shown = shownShape(s);
  assert.ok(shown.languages.length === 3 && shown.complexity?.hotspots.length === 3 && s.complexity?.hotspots.length === 4, 'the stored shape keeps every hotspot');
});

test('summarize: the pipeline takes the first and latest plays and adds the rest', () => {
  const plays: PlayFigures[] = [
    { state: 'closed', timeline: { toFirstFeedbackSeconds: 600, openToMergeSeconds: null, reviewRounds: 2, comments: 3, responseSeconds: 100 }, ci: { runs: 3, failedRuns: 2, reruns: 1, minutes: 12.5, queueSeconds: 60, firstPassGreen: false } },
    { state: 'merged', mergedAt: at(500), timeline: { toFirstFeedbackSeconds: 1200, openToMergeSeconds: 7200, reviewRounds: 1, comments: null, responseSeconds: 300 }, ci: { runs: 1, lastGreenSeconds: 240, minutes: 4.2, firstPassGreen: true } },
    { state: 'open' },
  ];
  const [p] = summarize(plays);
  assert.ok(p && p.plays === 2 && p.toFirstFeedbackSeconds === 600 && p.openToMergeSeconds === 7200 && p.reviewRounds === 3 && p.comments === 3, JSON.stringify(p));
  assert.equal(p.firstPassGreen, false, 'the first play’s first run failed');
  assert.deepEqual(p.ci, { runs: 4, failedRuns: 2, reruns: 1, minutes: 16.7, queueSeconds: 60 });
  assert.deepEqual(p.median, { toFirstFeedbackSeconds: 900, openToMergeSeconds: 7200, responseSeconds: 200, lastGreenSeconds: 240 });
  assert.deepEqual(summarize([{ state: 'open' }]), [null, null], 'a play without figures sums to nothing');
});

test('summarize: the card shape adds merged plays', () => {
  const plays: PlayFigures[] = [
    { state: 'merged', shape: { files: 3, countedLines: 100, testLines: 20, docsTouched: 1, languages: [{ name: 'Go', lines: 80 }, { name: 'Markdown', lines: 20 }], complexity: { added: 10, removed: 4, maxDepth: 3, hotspots: [{ path: 'a.go', added: 6 }, { path: 'b.go', added: 4 }] } } },
    { state: 'closed', shape: { files: 99 } },
    { state: 'merged', shape: { files: 2, countedLines: 50, testLines: 30, truncated: true, languages: [{ name: 'Go', lines: 40 }, { name: 'YAML', lines: 10 }, { name: 'Shell', lines: 5 }, { name: 'SQL', lines: 1 }], complexity: { added: 5, removed: 9, maxDepth: 5, hotspots: [{ path: 'b.go', added: 5 }, { path: 'c.go', added: 1 }] } } },
  ];
  const [, s] = summarize(plays);
  assert.ok(s && s.plays === 2 && s.complete && s.files === 5 && s.countedLines === 150 && s.testLines === 50 && s.testRatio === 0.5 && s.docsTouched === 1 && s.truncated, JSON.stringify(s));
  assert.deepEqual(s.complexity, { method: complexityMethod, added: 15, removed: 13, net: 2, maxDepth: 5, hotspots: [{ path: 'b.go', added: 9 }, { path: 'a.go', added: 6 }, { path: 'c.go', added: 1 }] });
  assert.deepEqual(s.languages, [{ name: 'Go', lines: 120 }, { name: 'Markdown', lines: 20 }, { name: 'YAML', lines: 10 }]);
  const [, partial] = summarize([...plays, { state: 'merged' }]);
  assert.ok(partial && !partial.complete && partial.plays === 2, 'a merged play without a shape makes the sum incomplete');
  const [, unknown] = summarize([{ state: 'merged', shape: { files: 1 } }, plays[0]!]);
  assert.ok(unknown && unknown.countedLines === null && unknown.testLines === null && unknown.complexity === null, 'a play without lines or a diff leaves the sums unknown');
});

type Golden = { name: string; kind: string; input: Record<string, unknown>; output: unknown };

const fixtureDirectory = new URL('./fixtures/cards/playkpi/', import.meta.url);

function ms(value: unknown): number | null {
  return typeof value === 'string' ? Date.parse(value) : null;
}

function playOf(raw: Record<string, unknown>): Play {
  const list = <T>(value: unknown, map: (item: Record<string, unknown>) => T): T[] | null => (Array.isArray(value) ? value.map(item => map(item as Record<string, unknown>)) : null);
  return {
    openedAt: ms(raw.openedAt),
    author: raw.author as string,
    draft: raw.draft as boolean | null,
    mergedAt: ms(raw.mergedAt),
    headSha: raw.headSha as string,
    reviews: list(raw.reviews, r => ({ reviewer: r.reviewer as string, state: r.state as string, headSha: r.headSha as string, at: ms(r.at)! })),
    activityCapturedAt: ms(raw.activityCapturedAt),
    activityTruncated: raw.activityTruncated as boolean,
    events: list(raw.events, e => ({ kind: e.kind as string, actor: e.actor as string, at: ms(e.at)!, state: e.state as string, headSha: e.headSha as string })),
    commits: raw.commits as number | null,
    firstCommitAt: ms(raw.firstCommitAt),
    forcePushes: raw.forcePushes as number | null,
    ciCapturedAt: ms(raw.ciCapturedAt),
    ciSource: raw.ciSource as string,
    ciTruncated: raw.ciTruncated as boolean,
    runs: list(raw.runs, r => ({
      id: r.id as string, sha: r.sha as string, workflow: r.workflow as string, status: r.status as string,
      createdAt: ms(r.createdAt), startedAt: ms(r.startedAt), completedAt: ms(r.completedAt),
      jobs: list(r.jobs, j => ({ name: j.name as string, status: j.status as string, startedAt: ms(j.startedAt), completedAt: ms(j.completedAt), queuedSeconds: (j.queuedSeconds ?? null) as number | null, attempt: j.attempt as number })),
    })),
  };
}

function diffOf(value: unknown): Uint8Array | null {
  if (value === null || value === undefined) return null;
  return Buffer.concat((value as { b64: string; repeat: number }[]).map(part => Buffer.from(part.b64, 'base64').toString('latin1').repeat(part.repeat)).map(text => Buffer.from(text, 'latin1')));
}

function playkpiOutput(kind: string, input: Record<string, unknown>): unknown {
  switch (kind) {
    case 'derive': {
      const bots = new Set((input.bots as string[]).map(b => b.toLowerCase()));
      const [timeline, ci] = derive(playOf(input.play as Record<string, unknown>), login => login !== '' && !bots.has(login.toLowerCase()));
      return { ci, timeline };
    }
    case 'complexity': {
      const excluded = new Set(input.excluded as string[] | null ?? []);
      return measureComplexity(diffOf(input.diff) ?? new Uint8Array(0), input.excluded ? path => excluded.has(path) : null);
    }
    case 'indentUnit':
      return indentUnit(input.lines as string[]);
    case 'measure': {
      const shape = measure({
        files: input.files as FileLines[] | null, filesTruncated: input.filesTruncated as boolean, total: input.total as number | null,
        diff: diffOf(input.diff), diffTruncated: input.diffTruncated as boolean,
        size: compileRarityRules(input.sizeRules as RarityRules), paths: compileShapeRules(input.shapeRules as ShapeRules), capturedAt: ms(input.capturedAt),
      });
      return { shape, shown: shownShape(shape) };
    }
    case 'shapeRules': {
      try {
        const m = compileShapeRules(input.rules as ShapeRules);
        const files = input.files as string[];
        return { value: { doc: files.map(f => m.doc(f)), language: files.map(languageOf), test: files.map(f => m.test(f)) }, error: null };
      } catch (error) {
        return { value: null, error: (error as Error).message };
      }
    }
    case 'summarize': {
      const plays = (input.plays as Record<string, unknown>[]).map(p => ({ ...p, mergedAt: ms(p.mergedAt) }) as PlayFigures);
      const [pipeline, shape] = summarize(plays);
      return { pipeline, shape };
    }
    default:
      throw new Error(`unknown fixture kind ${kind}`);
  }
}

test('golden fixtures written by the real Go playkpi package match', () => {
  const names = readdirSync(fixtureDirectory).filter(name => name.endsWith('.json')).sort();
  assert.ok(names.length > 0, 'fixtures exist');
  let cases = 0;
  for (const name of names) {
    const fixtures = JSON.parse(readFileSync(new URL(name, fixtureDirectory), 'utf8')) as Golden[];
    for (const fixture of fixtures) {
      cases++;
      const got = JSON.parse(JSON.stringify(playkpiOutput(fixture.kind, fixture.input)));
      assert.equal(JSON.stringify(got), JSON.stringify(fixture.output), `${name}: ${fixture.name}`);
    }
  }
  assert.ok(cases > 0);
});
