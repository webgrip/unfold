import type { PloegCardRarityInputs, PloegRarityTier } from './ploeg.ts';

/** The rarity formula this module computes (Ploeg ADR-0056, proposed). It matches `rarityComponents` in `public/cards/card-model.js`. */
export const rarityFormula = '2026.1';
/** How much each component weighs in a score out of 100. */
export const rarityWeights = Object.freeze({ reach: 0.3, sensitive: 0.25, novelty: 0.2, size: 0.25 });
/** The scores at which a tier starts while a cohort holds fewer than `rarityCohortMinimum` cards. */
export const rarityThresholds = Object.freeze([['legendary', 85], ['epic', 70], ['rare', 55], ['uncommon', 35]] as const);
/** The cohort size from which tiers come from percentiles instead of the fixed thresholds. */
export const rarityCohortMinimum = 30;
/** What a predicted score adds for a card in an epic's set, before the cap at 100. */
export const raritySetBonus = 10;

/** Each component from 0 to 1 under formula 2026.1; an unknown input adds nothing. */
export function rarityComponents(inputs: PloegCardRarityInputs): Record<keyof typeof rarityWeights, number> {
  const modules = Math.max(1, inputs.reach.modules ?? 0);
  const repos = Math.max(1, inputs.reach.repos ?? 1);
  const files = inputs.novelty.files ?? 0;
  const share = inputs.novelty.share ?? (files > 0 && inputs.novelty.novel !== null ? inputs.novelty.novel / files : 0);
  return {
    reach: Math.min(1, Math.log(modules + 3 * (repos - 1)) / Math.log(12)),
    sensitive: Math.min(1, Math.log(1 + (inputs.sensitive.files ?? 0)) / Math.log(9)),
    novelty: Math.min(1, Math.max(0, share)),
    size: Math.min(1, Math.log(1 + (inputs.size.countedLines ?? 0)) / Math.log(2001)),
  };
}

/** The challenge score from 0 to 100, to one decimal; a predicted score adds the set bonus when the card is in an epic's set. */
export function rarityScore(inputs: PloegCardRarityInputs, predicted: boolean): number {
  const parts = rarityComponents(inputs);
  const raw = 100 * (Object.keys(rarityWeights) as (keyof typeof rarityWeights)[]).reduce((total, key) => total + rarityWeights[key] * parts[key], 0);
  return Math.round(Math.min(100, raw + (predicted && inputs.set === true ? raritySetBonus : 0)) * 10) / 10;
}

/** The tier a score gets under the fixed thresholds that apply while a cohort is small. */
export function fixedRarityTier(score: number): PloegRarityTier {
  return rarityThresholds.find(([, from]) => score >= from)?.[0] ?? 'common';
}

/** The tier a percentile in its cohort gets: above 99 legendary, above 95 epic, above 85 rare, above 60 uncommon. */
export function percentileRarityTier(percentile: number): PloegRarityTier {
  return percentile > 99 ? 'legendary' : percentile > 95 ? 'epic' : percentile > 85 ? 'rare' : percentile > 60 ? 'uncommon' : 'common';
}

/** A score's percentile among its cohort's scores, this card's included: 100 × (1 + scores strictly below) / cohort size. */
export function rarityPercentile(score: number, cohort: number[]): number {
  return Math.round(1000 * (1 + cohort.filter(other => other < score).length) / Math.max(1, cohort.length)) / 10;
}

/** The calendar quarter in UTC of a time, as Ploeg names a cohort: `2026Q4`. */
export function rarityQuarter(at: string | number): string {
  const date = new Date(at);
  return `${date.getUTCFullYear()}Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}
