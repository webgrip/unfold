/** The ceremony tiers, quietest first. */
export const tiers = Object.freeze(['minor', 'major', 'epic', 'legendary']);

/**
 * What each tier may do, from the game-feel research's parameters: the longest a ceremony runs, the card's trauma
 * (shake is trauma squared), the juice squash, the most particles, the hit-stop and slow motion handed to a live skin,
 * how many soft flashes it may ask for, and whether it may take over the page.
 */
export const tierSpecs = Object.freeze({
  minor: Object.freeze({ rank: 0, maxMs: 500, anticipationMs: 60, trauma: 0, juice: 0.06, particles: 6, hitStopMs: 0, slowMo: null, flashes: 0, takeover: false, title: false }),
  major: Object.freeze({ rank: 1, maxMs: 900, anticipationMs: 120, trauma: 0.15, juice: 0.1, particles: 18, hitStopMs: 50, slowMo: null, flashes: 1, takeover: false, title: true }),
  epic: Object.freeze({ rank: 2, maxMs: 1800, anticipationMs: 200, trauma: 0.3, juice: 0.16, particles: 44, hitStopMs: 70, slowMo: Object.freeze({ scale: 0.45, ms: 700 }), flashes: 1, takeover: false, title: true }),
  legendary: Object.freeze({ rank: 3, maxMs: 3500, anticipationMs: 250, trauma: 0.5, juice: 0.25, particles: 120, hitStopMs: 90, slowMo: Object.freeze({ scale: 0.32, ms: 1300 }), flashes: 1, takeover: true, title: true }),
});

/** Moment kinds with a tighter limit than their tier: a crack informs in at most 1.5 s, a mend ends the arc in at most 2.5 s. */
export const momentCapsMs = Object.freeze({ cracked: 1500, mended: 2500 });

/** The moment kinds a card's news can carry, with what each one is called. */
export const momentLabels = Object.freeze({ minted: 'Minted', merged: 'Merged', released: 'Released', rarity: 'Rarity revealed', finish: 'Finish', cracked: 'Cracked', mended: 'Mended', graded: 'Graded', set: 'Set complete' });

const finishRank = Object.freeze({ matte: 0, foil: 1, holo: 2, prism: 3, gilded: 4, infinity: 5 });

/** The ceremony tier of a rarity reveal by the revealed tier: common and uncommon are minor, rare major, epic epic and legendary legendary. Only a reveal's own size follows rarity (Vloer ADR 0034). */
export const rarityRevealTiers = Object.freeze({ common: 'minor', uncommon: 'minor', rare: 'major', epic: 'epic', legendary: 'legendary' });

/**
 * The tier a moment plays at, from its kind and its facts only, never from who did it, and never from a card's rarity
 * except for the rarity reveal itself, which plays at the size of the revealed tier (`rarityRevealTiers`); a reveal
 * below its prediction plays at the revealed tier like any other, with no loss cue.
 * Intensity is inverse to frequency: a merge or a release happens several times a week and is major; a finish step is
 * a level-up and epic, and the year-long infinity step is legendary; a crack informs at major, and its mend is epic so
 * the arc ends on the repair; a first or higher grade is major and a lower one minor; a completed set is legendary.
 * @param {{ kind: string, detail?: Record<string, unknown> }} moment
 * @returns {'minor' | 'major' | 'epic' | 'legendary'}
 */
export function momentTier(moment) {
  const detail = moment?.detail ?? {};
  switch (moment?.kind) {
    case 'merged': return 'major';
    case 'released': return 'major';
    case 'rarity': return rarityRevealTiers[detail.tier] ?? 'minor';
    case 'finish': return (finishRank[detail.to] ?? 0) >= 5 ? 'legendary' : 'epic';
    case 'cracked': return 'major';
    case 'mended': return 'epic';
    case 'graded': return typeof detail.from === 'number' && typeof detail.to === 'number' && detail.to < detail.from ? 'minor' : 'major';
    case 'set': return 'legendary';
    default: return 'minor';
  }
}

/** The tier one step quieter, never below minor. */
export function quieter(tier) {
  return tiers[Math.max(0, tiers.indexOf(tier) - 1)] ?? 'minor';
}

/** The longest a moment's ceremony may run at `tier`, in milliseconds. */
export function ceremonyCapMs(kind, tier) {
  const spec = tierSpecs[tier] ?? tierSpecs.minor;
  return Math.min(spec.maxMs, momentCapsMs[kind] ?? Infinity);
}
