/** Every grade formula Ploeg shipped, oldest first: 2026.1 (Ploeg ADR-0050), 2026.2 with cracks, reverts and hotfixes (ADR-0052), 2026.3 counting rework rounds and capping missing inputs (ADR-0061). */
export const gradeFormulas = ['2026.1', '2026.2', '2026.3'] as const;
/** A grade formula version. */
export type GradeFormula = typeof gradeFormulas[number];
/** The formula every card read computes, including the grades of cards read before it shipped. */
export const currentGradeFormula: GradeFormula = '2026.3';
/** How long a card is live before its grade stops being provisional. */
export const provisionalDays = 180;

/** The four parts of a grade. */
export type CardSubgrades = { reliability: number; durability: number; delivery: number; review: number };
/** The facts each subgrade used, as Ploeg's `store.CardGradeInputs` encodes them. Formula 2026.1 and 2026.2 carry no `missing`, and 2026.1 and 2026.2 no `reworkRounds`. */
export type CardGradeInputs = {
  reliability: { crackWeight: number | null; reverted: boolean | null };
  durability: { daysLive: number; liveSince: string | null; reverts: number | null; hotfixes: number | null; survival: number | null };
  delivery: { budgetShare: number | null; defectBounces: number | null; extraPlays: number; failedRuns: number };
  review: { ciFirstGreen: boolean | null; findings: number | null; changeRequests: number; reviewRounds: number; reworkRounds?: number };
  notCollected: string[];
  missing?: string[];
};
/** A card's grade, as Ploeg's `store.CardGrade` encodes it. `evidenceComplete` exists from formula 2026.3. */
export type CardGrade = { formula: string; overall: number; provisional: boolean; evidenceComplete?: boolean; subgrades: CardSubgrades; label: string | null; qualifiers: string[]; inputs: CardGradeInputs };

/** What a grade is computed from. Times are whole epoch microseconds; `liveSince` is the release, null while the card is not live; `defectBounces` is null when the board maps no gates. */
export type GradeFacts = {
  now: number; liveSince: number | null; liveSinceText: string | null; costUsd: number | null; authorizedUsd: number; defectBounces: number | null;
  plays: number; failedRuns: number; changeRequests: number; reviewRounds: number; reworkRounds: number;
  crackWeight: number; cracked: boolean; reverts: number; hotfixes: number;
};

const weights = { reliability: 0.40, durability: 0.25, delivery: 0.20, review: 0.15 };
const penaltyDefectBounce = 1.5;
const penaltyExtraPlay = 1.0;
const penaltyFailedRun = 0.5;
const penaltyChangeRequest = 1.0;
const penaltyExtraRound = 0.5;
const penaltyReworkRound = 1.0;
const provisionalCap = 9.0;
const missingCap = 9.0;
/** The reliability weight a reverted play counts as at least (ADR-0052). */
export const revertFloorWeight = 2;
/** The highest reliability a cracked or reverted card reaches. */
export const crackedCeiling = 9.5;
const penaltyRevert = 2.0;
const penaltyHotfix = 1.0;
const dayMicros = 86_400_000_000;

/** Rounds to the nearest half step with ties up, within 1 to 10, as Ploeg's `halfStep`. */
export function halfStep(x: number): number {
  const r = Math.floor(x * 2 + 0.5 + 1e-9) / 2;
  return Math.max(1, Math.min(10, r));
}

function budgetPenalty(share: number | null): number {
  if (share === null || share <= 1) return 0;
  return share <= 1.25 ? 1 : 2;
}

function reliabilityOf(weight: number, cracked: boolean, reverted: boolean): number {
  const w = reverted ? Math.max(weight, revertFloorWeight) : weight;
  const r = halfStep(10 - w);
  return cracked || reverted ? Math.min(r, crackedCeiling) : r;
}

/** Computes a grade under `formula`, exactly as the Ploeg release that shipped that formula did. */
export function computeGrade(f: GradeFacts, formula: GradeFormula = currentGradeFormula): CardGrade {
  const v2 = formula !== '2026.1';
  const v3 = formula === '2026.3';
  const notCollected = v2 ? ['durability.survival', 'review.ciFirstGreen', 'review.findings'] : ['reliability.crackWeight', 'reliability.reverted', 'durability.reverts', 'durability.hotfixes', 'durability.survival', 'review.ciFirstGreen', 'review.findings'];
  const reverted = f.reverts > 0;
  const daysLive = f.liveSince !== null && f.now > f.liveSince ? Math.trunc((f.now - f.liveSince) / dayMicros) : 0;
  const budgetShare = f.costUsd !== null && f.authorizedUsd > 0 ? f.costUsd / f.authorizedUsd : null;
  const extraPlays = f.plays > 1 ? f.plays - 1 : 0;
  const inputs: CardGradeInputs = {
    reliability: v2 ? { crackWeight: f.crackWeight, reverted } : { crackWeight: null, reverted: null },
    durability: { daysLive, liveSince: f.liveSinceText, reverts: v2 ? f.reverts : null, hotfixes: v2 ? f.hotfixes : null, survival: null },
    delivery: { budgetShare, defectBounces: f.defectBounces, extraPlays, failedRuns: f.failedRuns },
    review: { ciFirstGreen: null, findings: null, changeRequests: f.changeRequests, reviewRounds: f.reviewRounds, ...(v3 ? { reworkRounds: f.reworkRounds } : {}) },
    notCollected,
  };
  const missing: string[] = [];
  if (v3) {
    if (budgetShare === null) missing.push('delivery.budgetShare');
    if (f.defectBounces === null) missing.push('delivery.defectBounces');
    inputs.missing = missing;
  }
  const defects = f.defectBounces ?? 0;
  const durabilityBase = 6 + 4 * Math.sqrt(Math.min(1, daysLive / provisionalDays));
  const review = v3 ? 10 - penaltyReworkRound * f.reworkRounds : 10 - penaltyChangeRequest * f.changeRequests - penaltyExtraRound * Math.max(0, f.reviewRounds - 1);
  const sub: CardSubgrades = {
    reliability: v2 ? reliabilityOf(f.crackWeight, f.cracked, reverted) : 10,
    durability: halfStep(v2 ? durabilityBase - penaltyRevert * f.reverts - penaltyHotfix * f.hotfixes : durabilityBase),
    delivery: halfStep(10 - budgetPenalty(budgetShare) - penaltyDefectBounce * defects - penaltyExtraPlay * extraPlays - penaltyFailedRun * f.failedRuns),
    review: halfStep(review),
  };
  for (const input of missing) {
    const part = input.split('.', 1)[0] as keyof CardSubgrades;
    if (part in sub) sub[part] = Math.min(sub[part], missingCap);
  }
  const provisional = daysLive < provisionalDays;
  let overall = halfStep(weights.reliability * sub.reliability + weights.durability * sub.durability + weights.delivery * sub.delivery + weights.review * sub.review);
  if (provisional) overall = Math.min(overall, provisionalCap);
  let label: string | null = null;
  if (!provisional && missing.length === 0) {
    if (sub.reliability === 10 && sub.durability === 10 && sub.delivery === 10 && sub.review === 10) label = 'black';
    else if (overall === 10) label = 'gold';
  }
  const qualifiers: string[] = [];
  if (v2 && reverted) qualifiers.push('RV');
  if (v2 && f.hotfixes > 0) qualifiers.push('HF');
  if (budgetShare !== null && budgetShare > 1 + 1e-9) qualifiers.push('OB');
  if (f.failedRuns > 0) qualifiers.push('RT');
  return { formula, overall, provisional, ...(v3 ? { evidenceComplete: missing.length === 0 } : {}), subgrades: sub, label, qualifiers, inputs };
}

/** The weight of one confirmed crack on reliability (ADR-0052): severity × share × discovery × warranty × mend. */
export const severityWeights: Readonly<Record<string, number>> = Object.freeze({ S1: 4, S2: 2, S3: 1, S4: 0.25 });
/** How discovery scales a crack's weight. */
export const discoveryFactors: Readonly<Record<string, number>> = Object.freeze({ self: 0.5, discovered: 1, concealed: 1.5 });
const contributingShare = 0.25;
const stewardMendFactor = 0.5;
const otherMendFactor = 0.75;
const warrantyFullDays = 180;
const warrantyHalfDays = 365;

/** The warranty a crack falls under by the card's age when its bug Work Item was created: full, half or history, with its factor. Times are epoch microseconds. */
export function warranty(liveSince: number | null, bugCreated: number): ['full' | 'half' | 'history', number] {
  if (liveSince === null || !(bugCreated > liveSince)) return ['full', 1];
  const days = Math.trunc((bugCreated - liveSince) / dayMicros);
  if (days <= warrantyFullDays) return ['full', 1];
  if (days <= warrantyHalfDays) return ['half', 0.5];
  return ['history', 0];
}

/** A crack's weight; `primaries` counts the counting primary cracks of the same bug, `mend` is its confirmed-or-not mend. */
export function crackWeight(severity: string, share: string, discovery: string, primaries: number, warrantyFactor: number, mend: { bySteward: boolean; confirmedAt: string | null } | null): number {
  const shareFactor = share === 'primary' ? 1 / Math.max(1, primaries) : contributingShare;
  let mendFactor = 1;
  if (mend && mend.confirmedAt !== null) mendFactor = mend.bySteward ? stewardMendFactor : otherMendFactor;
  return (severityWeights[severity] ?? 0) * shareFactor * (discoveryFactors[discovery] ?? 0) * warrantyFactor * mendFactor;
}
