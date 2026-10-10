import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { micros, rfc3339Micros } from '../src/cards/go.ts';
import { computeGrade, crackWeight, gradeFormulas, halfStep, warranty, type CardSubgrades, type GradeFacts, type GradeFormula } from '../src/cards/grade.ts';

const dayMicros = 86_400_000_000;
const hourMicros = 3_600_000_000;
const now = micros('2026-10-01T12:00:00Z');
const ago = (days: number) => now - days * dayMicros - hourMicros;

type FactsIn = Partial<Omit<GradeFacts, 'liveSinceText'>>;

function facts(f: FactsIn): GradeFacts {
  const liveSince = f.liveSince ?? null;
  return {
    now, liveSince: null, costUsd: null, authorizedUsd: 0, defectBounces: null, plays: 0, failedRuns: 0, changeRequests: 0, reviewRounds: 0,
    reworkRounds: 0, crackWeight: 0, cracked: false, reverts: 0, hotfixes: 0, ...f, liveSinceText: liveSince === null ? null : rfc3339Micros(liveSince),
  };
}

const sub = (reliability: number, durability: number, delivery: number, review: number): CardSubgrades => ({ reliability, durability, delivery, review });

const fixture = <T>(name: string): T => JSON.parse(readFileSync(new URL(`fixtures/cards/grade/${name}`, import.meta.url), 'utf8')) as T;

test('halfStep rounds to the nearest half with ties up', () => {
  const cases: [number, number][] = [
    [8.24, 8], [8.25, 8.5], [8.74, 8.5], [8.75, 9], [9.0, 9], [0.2, 1], [12, 10], [-3, 1],
    [0.40 * 10 + 0.25 * 6 + 0.20 * 10 + 0.15 * 10, 9],
    [0.40 * 10 + 0.25 * 8.5 + 0.20 * 7.5 + 0.15 * 9, 9],
  ];
  for (const [x, want] of cases) assert.equal(halfStep(x), want, `halfStep(${x})`);
});

type FormulaCase = { name: string; facts: FactsIn; sub: CardSubgrades; overall: number; provisional: boolean; label: string | null; qualifiers: string[] };

const formulaCasesBefore3: FormulaCase[] = [
  { name: 'not live yet: durability starts at 6', facts: { plays: 1, reviewRounds: 1 }, sub: sub(10, 6, 10, 10), overall: 9, provisional: true, label: null, qualifiers: [] },
  { name: '45 days live: durability 8', facts: { liveSince: ago(45), plays: 1, reviewRounds: 1 }, sub: sub(10, 8, 10, 10), overall: 9, provisional: true, label: null, qualifiers: [] },
  { name: '179 days live is still provisional: capped at 9 and no label', facts: { liveSince: ago(179), plays: 1, reviewRounds: 1 }, sub: sub(10, 10, 10, 10), overall: 9, provisional: true, label: null, qualifiers: [] },
  { name: '180 days live, all tens: black', facts: { liveSince: ago(180), plays: 1, reviewRounds: 1, defectBounces: 0 }, sub: sub(10, 10, 10, 10), overall: 10, provisional: false, label: 'black', qualifiers: [] },
  { name: '180 days live, overall 10 without four tens: gold', facts: { liveSince: ago(180), plays: 1, reviewRounds: 2 }, sub: sub(10, 10, 10, 9.5), overall: 10, provisional: false, label: 'gold', qualifiers: [] },
  { name: 'over budget by a quarter or less costs 1 and marks OB', facts: { liveSince: ago(400), plays: 1, reviewRounds: 1, costUsd: 2.5, authorizedUsd: 2 }, sub: sub(10, 10, 9, 10), overall: 10, provisional: false, label: 'gold', qualifiers: ['OB'] },
  { name: 'over budget by more than a quarter costs 2', facts: { liveSince: ago(400), plays: 1, reviewRounds: 1, costUsd: 2.51, authorizedUsd: 2 }, sub: sub(10, 10, 8, 10), overall: 9.5, provisional: false, label: null, qualifiers: ['OB'] },
  { name: 'within budget costs nothing', facts: { plays: 1, reviewRounds: 1, costUsd: 2, authorizedUsd: 2 }, sub: sub(10, 6, 10, 10), overall: 9, provisional: true, label: null, qualifiers: [] },
  { name: 'failed runs, extra plays and defect bounces lower delivery; RT', facts: { liveSince: ago(45), plays: 2, failedRuns: 1, defectBounces: 2, reviewRounds: 1 }, sub: sub(10, 8, 5.5, 10), overall: 8.5, provisional: true, label: null, qualifiers: ['RT'] },
  { name: 'change requests and extra rounds lower review', facts: { liveSince: ago(45), plays: 1, changeRequests: 2, reviewRounds: 3, defectBounces: 1 }, sub: sub(10, 8, 8.5, 7), overall: 9, provisional: true, label: null, qualifiers: [] },
  { name: 'subgrades never fall below 1', facts: { plays: 12, failedRuns: 9, changeRequests: 15, reviewRounds: 4 }, sub: sub(10, 6, 1, 1), overall: 6, provisional: true, label: null, qualifiers: ['RT'] },
];

const known = (f: FactsIn): FactsIn => ({ ...f, ...(f.costUsd === undefined ? { costUsd: 1, authorizedUsd: 2 } : {}), defectBounces: f.defectBounces ?? 0 });

const formulaCases3: FormulaCase[] = [
  { name: 'not live yet: durability starts at 6', facts: known({ plays: 1, reviewRounds: 1 }), sub: sub(10, 6, 10, 10), overall: 9, provisional: true, label: null, qualifiers: [] },
  { name: '45 days live: durability 8', facts: known({ liveSince: ago(45), plays: 1, reviewRounds: 1 }), sub: sub(10, 8, 10, 10), overall: 9, provisional: true, label: null, qualifiers: [] },
  { name: '179 days live is still provisional: capped at 9 and no label', facts: known({ liveSince: ago(179), plays: 1, reviewRounds: 1 }), sub: sub(10, 10, 10, 10), overall: 9, provisional: true, label: null, qualifiers: [] },
  { name: '180 days live, all tens: black', facts: known({ liveSince: ago(180), plays: 1, reviewRounds: 1 }), sub: sub(10, 10, 10, 10), overall: 10, provisional: false, label: 'black', qualifiers: [] },
  { name: '180 days live, overall 10 without four tens: gold', facts: known({ liveSince: ago(180), plays: 1, changeRequests: 1, reviewRounds: 2, reworkRounds: 1 }), sub: sub(10, 10, 10, 9), overall: 10, provisional: false, label: 'gold', qualifiers: [] },
  { name: 'over budget by a quarter or less costs 1 and marks OB', facts: known({ liveSince: ago(400), plays: 1, reviewRounds: 1, costUsd: 2.5, authorizedUsd: 2 }), sub: sub(10, 10, 9, 10), overall: 10, provisional: false, label: 'gold', qualifiers: ['OB'] },
  { name: 'over budget by more than a quarter costs 2', facts: known({ liveSince: ago(400), plays: 1, reviewRounds: 1, costUsd: 2.51, authorizedUsd: 2 }), sub: sub(10, 10, 8, 10), overall: 9.5, provisional: false, label: null, qualifiers: ['OB'] },
  { name: 'within budget costs nothing', facts: known({ plays: 1, reviewRounds: 1, costUsd: 2, authorizedUsd: 2 }), sub: sub(10, 6, 10, 10), overall: 9, provisional: true, label: null, qualifiers: [] },
  { name: 'failed runs, extra plays and defect bounces lower delivery; RT', facts: known({ liveSince: ago(45), plays: 2, failedRuns: 1, defectBounces: 2, reviewRounds: 1 }), sub: sub(10, 8, 5.5, 10), overall: 8.5, provisional: true, label: null, qualifiers: ['RT'] },
  { name: 'approved and comment-only rounds lower nothing', facts: known({ liveSince: ago(400), plays: 1, reviewRounds: 4 }), sub: sub(10, 10, 10, 10), overall: 10, provisional: false, label: 'black', qualifiers: [] },
  { name: 'each rework round costs 1, however many reviewers asked in it', facts: known({ liveSince: ago(45), plays: 1, changeRequests: 3, reviewRounds: 3, reworkRounds: 2, defectBounces: 1 }), sub: sub(10, 8, 8.5, 8), overall: 9, provisional: true, label: null, qualifiers: [] },
  { name: 'subgrades never fall below 1', facts: known({ plays: 12, failedRuns: 9, changeRequests: 15, reviewRounds: 15, reworkRounds: 15 }), sub: sub(10, 6, 1, 1), overall: 6, provisional: true, label: null, qualifiers: ['RT'] },
];

const formulaCases: Record<GradeFormula, FormulaCase[]> = { '2026.1': formulaCasesBefore3, '2026.2': formulaCasesBefore3, '2026.3': formulaCases3 };

for (const formula of gradeFormulas) {
  test(`formula ${formula} grades as Ploeg's TestComputeGradeFormula`, async (t) => {
    for (const tc of formulaCases[formula]) {
      await t.test(tc.name, () => {
        const g = computeGrade(facts(tc.facts), formula);
        assert.equal(g.formula, formula);
        assert.deepEqual(g.subgrades, tc.sub);
        assert.equal(g.overall, tc.overall);
        assert.equal(g.provisional, tc.provisional);
        assert.equal(g.label, tc.label);
        assert.deepEqual(g.qualifiers, tc.qualifiers);
        if (formula === '2026.3') assert.deepEqual(g.inputs.missing, []);
      });
    }
  });
}

for (const formula of gradeFormulas) {
  test(`formula ${formula} keeps unknown inputs unknown`, () => {
    const { inputs: input } = computeGrade(facts({ plays: 1, authorizedUsd: 2, reviewRounds: 1 }), formula);
    assert.equal(input.delivery.budgetShare, null);
    assert.equal(input.delivery.defectBounces, null);
    assert.equal(input.durability.liveSince, null);
    assert.equal(input.durability.daysLive, 0);
    assert.equal(input.durability.survival, null);
    assert.equal(input.review.ciFirstGreen, null);
    assert.equal(input.review.findings, null);
    if (formula === '2026.1') {
      assert.deepEqual(input.reliability, { crackWeight: null, reverted: null });
      assert.equal(input.durability.reverts, null);
      assert.equal(input.durability.hotfixes, null);
      assert.deepEqual(input.notCollected, ['reliability.crackWeight', 'reliability.reverted', 'durability.reverts', 'durability.hotfixes',
        'durability.survival', 'review.ciFirstGreen', 'review.findings']);
    } else {
      assert.deepEqual(input.reliability, { crackWeight: 0, reverted: false });
      assert.equal(input.durability.reverts, 0);
      assert.equal(input.durability.hotfixes, 0);
      assert.deepEqual(input.notCollected, ['durability.survival', 'review.ciFirstGreen', 'review.findings']);
    }
    if (formula === '2026.3') assert.deepEqual(input.missing, ['delivery.budgetShare', 'delivery.defectBounces']);
    else assert.ok(!('missing' in input));
    assert.equal(computeGrade(facts({ plays: 1, costUsd: 0.5, authorizedUsd: 2 }), formula).inputs.delivery.budgetShare, 0.25);
  });
}

type CrackCase = { name: string; facts: FactsIn; sub: CardSubgrades; overall: number; label: string | null; qualifiers: string[] };

const crackCases: CrackCase[] = [
  { name: 'a discovered unmended S2 takes 2 off reliability', facts: { liveSince: ago(400), plays: 1, reviewRounds: 1, crackWeight: 2, cracked: true }, sub: sub(8, 10, 10, 10), overall: 9, label: null, qualifiers: [] },
  { name: 'a mended crack still ends below a never-cracked card', facts: { liveSince: ago(400), plays: 1, reviewRounds: 1, crackWeight: 0.0625, cracked: true }, sub: sub(9.5, 10, 10, 10), overall: 10, label: 'gold', qualifiers: [] },
  { name: 'a history-only crack weighs nothing and caps nothing', facts: { liveSince: ago(400), plays: 1, reviewRounds: 1, defectBounces: 0 }, sub: sub(10, 10, 10, 10), overall: 10, label: 'black', qualifiers: [] },
  { name: 'a revert counts as at least an S2 and lowers durability by 2; RV', facts: { liveSince: ago(400), plays: 1, reviewRounds: 1, reverts: 1 }, sub: sub(8, 8, 10, 10), overall: 8.5, label: null, qualifiers: ['RV'] },
  { name: 'a revert does not add to a heavier crack', facts: { liveSince: ago(400), plays: 1, reviewRounds: 1, reverts: 1, crackWeight: 4, cracked: true }, sub: sub(6, 8, 10, 10), overall: 8, label: null, qualifiers: ['RV'] },
  {
    name: 'a hotfix lowers durability by 1; HF before OB and RT',
    facts: { liveSince: ago(400), plays: 1, reviewRounds: 1, hotfixes: 1, crackWeight: 1, cracked: true, costUsd: 3, authorizedUsd: 2, failedRuns: 1 },
    sub: sub(9, 9, 7.5, 10), overall: 9, label: null, qualifiers: ['HF', 'OB', 'RT'],
  },
];

for (const formula of ['2026.2', '2026.3'] as const) {
  test(`formula ${formula} weighs cracks, reverts and hotfixes`, async (t) => {
    for (const tc of crackCases) {
      await t.test(tc.name, () => {
        const f: FactsIn = formula === '2026.3'
          ? { ...tc.facts, ...(tc.facts.costUsd === undefined ? { costUsd: 1, authorizedUsd: 2 } : {}), defectBounces: 0 }
          : tc.facts;
        const g = computeGrade(facts(f), formula);
        assert.deepEqual(g.subgrades, tc.sub);
        assert.equal(g.overall, tc.overall);
        assert.equal(g.label, tc.label);
        assert.deepEqual(g.qualifiers, tc.qualifiers);
        assert.equal(g.inputs.reliability.crackWeight, f.crackWeight ?? 0);
        assert.equal(g.inputs.durability.reverts, f.reverts ?? 0);
        assert.equal(g.inputs.reliability.reverted, (f.reverts ?? 0) > 0);
        assert.equal(g.inputs.durability.hotfixes, f.hotfixes ?? 0);
      });
    }
  });
}

test('formula 2026.3 caps the subgrade of a missing input and withholds the label', async (t) => {
  const live = now - 400 * dayMicros;
  const cases: { name: string; facts: FactsIn; delivery: number; overall: number; missing: string[] }[] = [
    { name: 'every input known: a black label', facts: { costUsd: 1, authorizedUsd: 2, defectBounces: 0 }, delivery: 10, overall: 10, missing: [] },
    { name: 'cost not reported', facts: { authorizedUsd: 2, defectBounces: 0 }, delivery: 9, overall: 10, missing: ['delivery.budgetShare'] },
    { name: 'nothing authorized', facts: { costUsd: 1, defectBounces: 0 }, delivery: 9, overall: 10, missing: ['delivery.budgetShare'] },
    { name: 'the board maps no gates', facts: { costUsd: 1, authorizedUsd: 2 }, delivery: 9, overall: 10, missing: ['delivery.defectBounces'] },
    { name: 'both unknown', facts: {}, delivery: 9, overall: 10, missing: ['delivery.budgetShare', 'delivery.defectBounces'] },
    { name: 'a known penalty below the cap still counts', facts: { costUsd: 3, authorizedUsd: 2 }, delivery: 8, overall: 9.5, missing: ['delivery.defectBounces'] },
  ];
  for (const tc of cases) {
    await t.test(tc.name, () => {
      const g = computeGrade(facts({ ...tc.facts, liveSince: live, plays: 1, reviewRounds: 1 }), '2026.3');
      assert.equal(g.subgrades.delivery, tc.delivery);
      assert.equal(g.overall, tc.overall);
      assert.deepEqual(g.inputs.missing, tc.missing);
      assert.equal(g.subgrades.reliability, 10);
      assert.equal(g.subgrades.durability, 10);
      assert.equal(g.subgrades.review, 10);
      const complete = tc.missing.length === 0;
      assert.equal(g.label !== null, complete);
      assert.equal(g.evidenceComplete, complete);
    });
  }
});

test('formula 2026.3 lowers review by rework rounds, not by reviews', () => {
  const cases: [string, number, number, number, number][] = [
    ['one approval', 10, 0, 1, 0],
    ['comments then approval over three heads', 10, 0, 3, 0],
    ['two reviewers approving the same head', 10, 0, 1, 0],
    ['two reviewers asking for changes on one head are one rework round', 9, 2, 2, 1],
    ['changes asked on two heads are two rework rounds', 8, 2, 3, 2],
  ];
  for (const [name, review, changeRequests, reviewRounds, reworkRounds] of cases) {
    const g = computeGrade(facts({ plays: 1, changeRequests, reviewRounds, reworkRounds }), '2026.3');
    assert.equal(g.subgrades.review, review, name);
    assert.deepEqual({ changeRequests: g.inputs.review.changeRequests, reviewRounds: g.inputs.review.reviewRounds, reworkRounds: g.inputs.review.reworkRounds },
      { changeRequests, reviewRounds, reworkRounds }, name);
  }
});

test('crack weight applies severity, share, discovery, warranty and mend', () => {
  const confirmed = '2026-09-01T00:00:00Z';
  const steward = { bySteward: true, confirmedAt: confirmed };
  const other = { bySteward: false, confirmedAt: confirmed };
  const pending = { bySteward: true, confirmedAt: null };
  const cases: [string, string, string, string, number, number, typeof steward | typeof pending | null, number][] = [
    ['S1 primary discovered, full warranty, unmended', 'S1', 'primary', 'discovered', 1, 1, null, 4],
    ['S2 self-reported', 'S2', 'primary', 'self', 1, 1, null, 1],
    ['S3 concealed', 'S3', 'primary', 'concealed', 1, 1, null, 1.5],
    ['S4 cosmetic', 'S4', 'primary', 'discovered', 1, 1, null, 0.25],
    ['two necessary primary causes split the blame', 'S2', 'primary', 'discovered', 2, 1, null, 1],
    ['a contributing cause carries a quarter', 'S1', 'contributing', 'discovered', 3, 1, null, 1],
    ['half warranty halves it', 'S1', 'primary', 'discovered', 1, 0.5, null, 2],
    ['history weighs nothing', 'S1', 'primary', 'discovered', 1, 0, null, 0],
    ['a confirmed mend by the steward halves it', 'S2', 'primary', 'discovered', 1, 1, steward, 1],
    ['a confirmed mend by someone else restores a quarter', 'S2', 'primary', 'discovered', 1, 1, other, 1.5],
    ['an unconfirmed mend restores nothing yet', 'S2', 'primary', 'discovered', 1, 1, pending, 2],
    ['self-reported S3 mended by the steward', 'S3', 'primary', 'self', 1, 1, steward, 0.25],
  ];
  for (const [name, severity, share, discovery, primaries, factor, mend, want] of cases) {
    assert.equal(crackWeight(severity, share, discovery, primaries, factor, mend), want, name);
  }
});

test('warranty by card age when the bug was raised', () => {
  const live = micros('2026-01-01T00:00:00Z');
  const day = (n: number) => live + n * dayMicros;
  const cases: [number | null, number, string, number][] = [
    [null, day(500), 'full', 1],
    [live, day(-3), 'full', 1],
    [live, day(180), 'full', 1],
    [live, day(181), 'half', 0.5],
    [live, day(365), 'half', 0.5],
    [live, day(366), 'history', 0],
  ];
  for (const [liveSince, bug, label, factor] of cases) assert.deepEqual(warranty(liveSince, bug), [label, factor], `warranty(${liveSince}, ${bug})`);
});

type GoldenCase = { input: GradeFacts; output: unknown };

for (const formula of gradeFormulas) {
  test(`formula ${formula} matches Ploeg's computeGrade on every golden case`, () => {
    const cases = fixture<GoldenCase[]>(`${formula}.json`);
    assert.ok(cases.length >= 250);
    for (const [i, { input, output }] of cases.entries()) {
      assert.equal(input.liveSinceText, input.liveSince === null ? null : rfc3339Micros(input.liveSince), `case ${i} liveSinceText`);
      assert.deepEqual(JSON.parse(JSON.stringify(computeGrade(input, formula))), output, `case ${i}: ${JSON.stringify(input)}`);
    }
  });
}

type Helpers = {
  halfStep: { x: number; want: number }[];
  warranty: { liveSince: number | null; bugCreated: number; label: string; factor: number }[];
  crackWeight: { severity: string; share: string; discovery: string; primaries: number; warranty: number; mend: { bySteward: boolean; confirmedAt: string | null } | null; want: number }[];
};

test('halfStep, warranty and crackWeight match Ploeg on every golden case', () => {
  const golden = fixture<Helpers>('helpers.json');
  for (const { x, want } of golden.halfStep) assert.equal(halfStep(x), want, `halfStep(${x})`);
  for (const w of golden.warranty) assert.deepEqual(warranty(w.liveSince, w.bugCreated), [w.label, w.factor], JSON.stringify(w));
  for (const c of golden.crackWeight) {
    assert.equal(crackWeight(c.severity, c.share, c.discovery, c.primaries, c.warranty, c.mend), c.want, JSON.stringify(c));
  }
  assert.ok(golden.halfStep.length > 0 && golden.warranty.length > 0 && golden.crackWeight.length > 0);
});
