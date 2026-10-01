/** The longest hit-stop and slow motion a ceremony may hand a skin: past about 120 ms a freeze reads as a dropped frame. */
export const timeLimits = Object.freeze({ hitStopMs: 120, slowMoMs: 2000, slowestScale: 0.2 });

/**
 * A clock a live skin multiplies its frame time by: zero during a hit-stop, the slow-motion scale during slow motion,
 * one otherwise. The director sets it from a ceremony's cues; a skin's live loop calls `scaled(dt)` every frame.
 * @param {() => number} [now] Milliseconds.
 */
export function createTimeScale(now = () => globalThis.performance?.now() ?? Date.now()) {
  let stopUntil = 0;
  let slowUntil = 0;
  let slowScale = 1;
  return {
    /** Freezes the skin's time for `ms` (at most 120). */
    hitStop(ms) { stopUntil = Math.max(stopUntil, now() + Math.min(timeLimits.hitStopMs, Math.max(0, ms))); },
    /** Slows the skin's time to `scale` (0.2 to 1) for `ms` (at most 2000). */
    slowMo(scale, ms) { slowScale = Math.min(1, Math.max(timeLimits.slowestScale, scale)); slowUntil = now() + Math.min(timeLimits.slowMoMs, Math.max(0, ms)); },
    /** The factor time runs at, at `at` (now by default). */
    scale(at = now()) { if (at < stopUntil) return 0; if (at < slowUntil) return slowScale; return 1; },
    /** `dt` scaled by the factor time runs at now. */
    scaled(dt) { return dt * this.scale(); },
    /** Ends any hit-stop or slow motion at once, as when a ceremony is skipped. */
    reset() { stopUntil = 0; slowUntil = 0; slowScale = 1; },
  };
}
