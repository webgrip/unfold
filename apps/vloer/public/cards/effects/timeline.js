import { ceremonyCapMs, tierSpecs } from './tiers.js';

/** WCAG 2.3.1: at most three flashes in any one second. */
export const flashLimit = Object.freeze({ count: 3, windowMs: 1000, opacity: 0.5 });

/** The flash colours a ceremony may use, as linear-ish RGB from 0 to 1. None is a saturated red. */
export const flashTones = Object.freeze({ warm: Object.freeze([1, 0.94, 0.8]), cool: Object.freeze([0.82, 0.9, 1]), white: Object.freeze([1, 1, 1]), gold: Object.freeze([1, 0.86, 0.55]) });

/** The particle palettes, by name; none uses red, so a crack reads as a dark fracture rather than an alarm. */
export const palettes = Object.freeze({
  gold: Object.freeze([[1, 0.84, 0.42], [1, 0.95, 0.75], [1, 0.7, 0.25]]),
  green: Object.freeze([[0.35, 1, 0.6], [0.7, 1, 0.85], [0.2, 0.85, 0.5]]),
  blue: Object.freeze([[0.4, 0.6, 1], [0.6, 0.85, 1], [0.55, 0.45, 1]]),
  prism: Object.freeze([[1, 0.62, 0.45], [1, 0.88, 0.35], [0.45, 1, 0.65], [0.4, 0.72, 1], [0.8, 0.5, 1]]),
  ink: Object.freeze([[0.32, 0.35, 0.38], [0.5, 0.53, 0.56], [0.18, 0.2, 0.22]]),
  silver: Object.freeze([[0.86, 0.9, 0.95], [0.7, 0.76, 0.84], [1, 1, 1]]),
  bronze: Object.freeze([[0.86, 0.56, 0.3], [1, 0.76, 0.5], [0.62, 0.4, 0.2]]),
});

/** How each moment looks and sounds: its palette, particle shape, flash tone, sound cue and title tone. */
export const momentLooks = Object.freeze({
  minted: Object.freeze({ palette: 'blue', shape: 'sparks', flash: null, sound: 'tick', tone: 'blue' }),
  merged: Object.freeze({ palette: 'gold', shape: 'seal', flash: 'warm', sound: 'seal', tone: 'gold' }),
  released: Object.freeze({ palette: 'blue', shape: 'rise', flash: 'cool', sound: 'release', tone: 'blue' }),
  finish: Object.freeze({ palette: 'prism', shape: 'prism', flash: 'white', sound: 'rise', tone: 'prism' }),
  cracked: Object.freeze({ palette: 'ink', shape: 'debris', flash: null, sound: 'crack', tone: 'ink' }),
  mended: Object.freeze({ palette: 'gold', shape: 'flow', flash: 'gold', sound: 'mend', tone: 'gold' }),
  graded: Object.freeze({ palette: 'silver', shape: 'sparks', flash: 'cool', sound: 'grade', tone: 'silver' }),
  set: Object.freeze({ palette: 'gold', shape: 'confetti', flash: 'warm', sound: 'set', tone: 'gold' }),
});

/**
 * How a rarity reveal looks and sounds, by the revealed tier: steel sparks, bronze sparks, silver light rising, a gold
 * confetti burst and, for legendary, the prism. Every tier rises in pitch; none has a falling or minor cue, so a reveal
 * below its prediction never sounds like a loss.
 */
export const rarityLooks = Object.freeze({
  common: Object.freeze({ palette: 'silver', shape: 'sparks', flash: null, sound: 'rarity', tone: 'silver', level: 0 }),
  uncommon: Object.freeze({ palette: 'bronze', shape: 'sparks', flash: null, sound: 'rarity', tone: 'bronze', level: 1 }),
  rare: Object.freeze({ palette: 'silver', shape: 'rise', flash: 'cool', sound: 'rarity', tone: 'silver', level: 2 }),
  epic: Object.freeze({ palette: 'gold', shape: 'confetti', flash: 'gold', sound: 'rarity', tone: 'gold', level: 3 }),
  legendary: Object.freeze({ palette: 'prism', shape: 'prism', flash: 'white', sound: 'rarity', tone: 'prism', level: 4 }),
});

/** The look of a moment: a rarity reveal's by its revealed tier, every other moment's by its kind. */
export function momentLook(moment) {
  if (moment?.kind === 'rarity') return rarityLooks[moment.detail?.tier] ?? rarityLooks.common;
  return momentLooks[moment?.kind] ?? momentLooks.minted;
}

/** Whether an RGB colour (0 to 1) is a saturated red, which WCAG holds to a stricter flash threshold and a ceremony never flashes. */
export function saturatedRed([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  return max === r && r > 0.5 && saturation > 0.5 && g < r * 0.6 && b < r * 0.6;
}

/**
 * The cues of one ceremony, in milliseconds from its start, in four phases: anticipation, impact, follow-through and
 * settle. Full motion lifts the card, squashes it on impact, hands the skin its hit-stop and slow motion, flashes at
 * most once (never for a crack, never red, at most half opacity, confined to the card), shakes the card and bursts
 * particles. Calm swaps all motion for a 150 ms brightness pulse and a crossfaded title, halves the duration and
 * caps it at 400 ms. `count` above one shows how many of the same moment were coalesced into it.
 * @param {{ kind: string }} moment
 * @param {'minor' | 'major' | 'epic' | 'legendary'} tier
 * @param {'full' | 'calm'} mode
 * @param {{ count?: number, takeover?: boolean }} [options]
 * @returns {{ durationMs: number, tier: string, mode: string, cues: object[] }}
 */
export function ceremonyTimeline(moment, tier, mode, { count = 1, takeover = true } = {}) {
  const spec = tierSpecs[tier] ?? tierSpecs.minor;
  const look = momentLook(moment);
  const full = ceremonyCapMs(moment?.kind, tier);
  const cues = [];
  if (mode !== 'full') {
    const durationMs = Math.min(400, Math.round(full / 2));
    cues.push({ at: 0, type: 'skin', mode: 'calm', durationMs });
    cues.push({ at: 0, type: 'pulse', ms: 150 });
    if (spec.title) cues.push({ at: 0, type: 'title', hold: durationMs, mode: 'calm', tone: look.tone, count });
    cues.push({ at: 0, type: 'sound', cue: look.sound, level: look.level ?? spec.rank });
    cues.push({ at: durationMs, type: 'settle' });
    return { durationMs, tier, mode: 'calm', cues };
  }
  const impact = spec.anticipationMs;
  cues.push({ at: 0, type: 'skin', mode: 'full', durationMs: full, impactAt: impact });
  if (spec.takeover && takeover) cues.push({ at: 0, type: 'takeover', ms: full });
  if (spec.rank > 0) cues.push({ at: 0, type: 'anticipate', ms: impact });
  cues.push({ at: impact, type: 'impact', juice: spec.juice });
  cues.push({ at: impact, type: 'sound', cue: look.sound, level: look.level ?? spec.rank });
  if (spec.hitStopMs) cues.push({ at: impact, type: 'hitstop', ms: spec.hitStopMs });
  if (spec.flashes && look.flash) cues.push({ at: impact, type: 'flash', opacity: Math.min(flashLimit.opacity, 0.22 + spec.rank * 0.07), tone: look.flash, ms: 180 });
  if (spec.trauma) cues.push({ at: impact, type: 'shake', trauma: spec.trauma });
  if (spec.particles) cues.push({ at: impact, type: 'particles', count: spec.particles, palette: look.palette, shape: look.shape });
  if (spec.slowMo) cues.push({ at: impact, type: 'slowmo', scale: spec.slowMo.scale, ms: Math.min(spec.slowMo.ms, full - impact) });
  if (spec.title) cues.push({ at: impact + 40, type: 'title', hold: Math.max(300, full - impact - 340), mode: 'full', tone: look.tone, count, banner: spec.takeover && takeover });
  cues.push({ at: Math.max(impact, full - 300), type: 'settle' });
  return { durationMs: full, tier, mode: 'full', cues: cues.sort((a, b) => a.at - b.at) };
}

/** The most flashes inside any `windowMs` stretch of the given flash times (milliseconds). */
export function peakFlashes(times, windowMs = flashLimit.windowMs) {
  const sorted = [...times].sort((a, b) => a - b);
  let peak = 0;
  for (let start = 0, end = 0; end < sorted.length; end++) {
    while (sorted[end] - sorted[start] >= windowMs) start++;
    peak = Math.max(peak, end - start + 1);
  }
  return peak;
}

/**
 * Whether a set of ceremony timelines, each started at its `offset` in milliseconds, stays inside the flash rules:
 * at most three flashes in any second, none above half opacity and none in a saturated red.
 * @param {{ offset?: number, timeline: { cues: object[] } }[]} played
 */
export function flashSafe(played) {
  const flashes = played.flatMap(({ offset = 0, timeline }) => timeline.cues.filter(cue => cue.type === 'flash').map(cue => ({ ...cue, at: offset + cue.at })));
  return peakFlashes(flashes.map(cue => cue.at)) <= flashLimit.count && flashes.every(cue => cue.opacity <= flashLimit.opacity && !saturatedRed(flashTones[cue.tone] ?? [1, 0, 0]));
}

/**
 * The page's flash ledger. Every flash, whether a ceremony's own or one a skin asks for, goes through `allow`, which
 * refuses a fourth flash inside any second, a saturated red and anything above half opacity is lowered to it.
 * @param {() => number} now Milliseconds.
 */
export function createFlashGuard(now) {
  const times = [];
  return {
    /** Records a flash and returns the opacity it may use, or 0 when it must not flash. */
    allow(opacity, tone = 'white') {
      const color = Array.isArray(tone) ? tone : flashTones[tone];
      if (!color || saturatedRed(color) || !(opacity > 0)) return 0;
      const at = now();
      while (times.length && at - times[0] >= flashLimit.windowMs) times.shift();
      if (times.length >= flashLimit.count) return 0;
      times.push(at);
      return Math.min(flashLimit.opacity, opacity);
    },
    /** The flash times still inside the last second. */
    get recent() { return [...times]; },
  };
}
