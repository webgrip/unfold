import { momentTier, quieter, tierSpecs } from './tiers.js';
import { ceremonyTimeline, createFlashGuard } from './timeline.js';

/**
 * The rules the director applies to every request: the same moment on the same card within `coalesceMs` joins the
 * ceremony already waiting or playing; the same kind again within `habituateMs` plays a tier quieter; at most `budget`
 * ceremonies above minor play per window, and the rest play as minor; one page takeover per `takeoverEveryMs`, never
 * while the person types or within `typingQuietMs` of a keystroke; a ceremony can be skipped `skipAfterMs` after it
 * starts; at most `queueLimit` wait. Every window is measured on the director's clock, so tests drive it with a fake one.
 */
export const directorRules = Object.freeze({ coalesceMs: 2000, habituateMs: 10_000, takeoverEveryMs: 600_000, typingQuietMs: 2000, skipAfterMs: 300, budget: Object.freeze({ count: 6, windowMs: 60_000 }), queueLimit: 6 });

/** The card motion preferences: everything, the reduced-motion swaps, or no ceremony at all. */
export const motionModes = Object.freeze(['full', 'calm', 'off']);

/**
 * The motion a page plays from the `cardMotion` preference: `full`, `calm` or `off` as chosen, and `auto` (or anything
 * else) is `full`, or `calm` while the device asks for reduced motion.
 * @param {string} preference
 * @param {boolean} reducedMotion
 * @returns {'full' | 'calm' | 'off'}
 */
export function resolveMotion(preference, reducedMotion) {
  if (motionModes.includes(preference)) return preference;
  return reducedMotion ? 'calm' : 'full';
}

/**
 * Creates the page's effects director. Views and skins ask it for a ceremony with `request(moment, target)`; it picks
 * the tier from the moment's kind and facts, applies coalescing, habituation, the budget and the takeover limit, and
 * hands one ceremony at a time to `stage.play(ticket, timeline)`, which draws it and resolves when it settles. With the
 * motion preference `off` nothing plays; with `calm` every ceremony is its reduced-motion swap. A hidden page or a held
 * director (a person-started ceremony such as a pack rip) queues requests until `resume()` or the hold's release.
 * @param {{ stage: { play: Function, skip?: Function, count?: Function }, now?: () => number, motion?: () => string, typing?: () => boolean, hidden?: () => boolean, rules?: object }} options
 */
export function createDirector({ stage, now = () => globalThis.performance?.now() ?? Date.now(), motion = () => 'full', typing = () => false, hidden = () => false, rules = directorRules } = {}) {
  const queue = [];
  const recent = [];
  const budget = [];
  const holds = new Set();
  const guard = createFlashGuard(now);
  let playing = null;
  let lastTakeover = -Infinity;
  let serial = 0;

  const settle = (ticket, status) => { ticket.status = status; ticket.resolve(ticket); };
  const currentMode = () => { const value = motion(); return motionModes.includes(value) ? value : 'full'; };

  function pump() {
    if (playing || holds.size || hidden() || !queue.length) return;
    const ticket = queue.shift();
    const at = now();
    const mode = currentMode();
    if (mode === 'off') { settle(ticket, 'off'); pump(); return; }
    while (budget.length && at - budget[0] >= rules.budget.windowMs) budget.shift();
    if (ticket.tier !== 'minor' && budget.length >= rules.budget.count) { ticket.tier = 'minor'; ticket.budgeted = true; }
    const wantsTakeover = tierSpecs[ticket.tier].takeover && mode === 'full';
    const takeover = wantsTakeover && at - lastTakeover >= rules.takeoverEveryMs && !typing();
    if (takeover) lastTakeover = at;
    ticket.takeover = takeover;
    if (ticket.tier !== 'minor') budget.push(at);
    ticket.mode = mode === 'full' ? 'full' : 'calm';
    ticket.timeline = ceremonyTimeline(ticket.moment, ticket.tier, ticket.mode, { count: ticket.count, takeover });
    ticket.startedAt = at;
    ticket.status = 'playing';
    playing = ticket;
    let result;
    try { result = stage.play(ticket, ticket.timeline); } catch { result = null; }
    Promise.resolve(result).catch(() => null).then(() => {
      if (playing === ticket) playing = null;
      settle(ticket, ticket.skipped ? 'skipped' : 'played');
      pump();
    });
  }

  return {
    /** The rules this director applies. */
    rules,
    /** The motion mode it plays in now: `full`, `calm` or `off`. */
    get mode() { return currentMode(); },
    /** The ceremony playing now, or null. */
    get playing() { return playing; },
    /** The ceremonies waiting, oldest first. */
    get waiting() { return [...queue]; },
    /**
     * Asks for a moment's ceremony on `target` (`key` names the card; `host` is its `<unfold-card>`). Returns a ticket
     * whose `done` promise resolves when it has played, been skipped, coalesced into another, dropped or switched off.
     * @param {{ kind: string, at?: string, detail?: object }} moment
     * @param {{ key?: string, host?: Element, [name: string]: unknown }} [target]
     */
    request(moment, target = {}) {
      const at = now();
      const key = `${moment?.kind}|${target.key ?? ''}`;
      const ticket = { id: ++serial, moment, target, key, tier: momentTier(moment), count: 1, requestedAt: at, status: 'queued', habituated: false, budgeted: false, takeover: false, skipped: false };
      ticket.done = new Promise(resolve => { ticket.resolve = resolve; });
      if (currentMode() === 'off') { settle(ticket, 'off'); return ticket; }
      const twin = [playing, ...queue].find(entry => entry && entry.key === key && at - entry.requestedAt < rules.coalesceMs);
      if (twin) {
        twin.count++;
        try { stage.count?.(twin, twin.count); } catch {}
        ticket.into = twin;
        settle(ticket, 'coalesced');
        return ticket;
      }
      while (recent.length && at - recent[0].at >= rules.habituateMs) recent.shift();
      if (recent.some(entry => entry.kind === moment?.kind)) { ticket.tier = quieter(ticket.tier); ticket.habituated = true; }
      recent.push({ kind: moment?.kind, at });
      if (queue.length >= rules.queueLimit) { settle(ticket, 'dropped'); return ticket; }
      queue.push(ticket);
      pump();
      return ticket;
    },
    /** Jumps the playing ceremony to its settled state, once it has run `skipAfterMs`. Returns whether it skipped. */
    skip() {
      if (!playing || now() - playing.startedAt < rules.skipAfterMs) return false;
      playing.skipped = true;
      try { stage.skip?.(playing); } catch {}
      return true;
    },
    /** Drops every waiting ceremony and skips the playing one, as when the person leaves the page. */
    clear() {
      for (const ticket of queue.splice(0)) settle(ticket, 'dropped');
      if (playing) { playing.skipped = true; try { stage.skip?.(playing); } catch {} }
    },
    /** Holds every request in the queue while a person-started ceremony runs; returns the function that releases it. */
    hold(name = 'hold') {
      const token = { name };
      holds.add(token);
      return () => { if (holds.delete(token)) pump(); };
    },
    /** Plays what waited while the page was hidden. */
    resume() { pump(); },
    /** Asks the page's flash ledger for a flash; returns the opacity it may use, or 0. */
    flash(opacity, tone) { return guard.allow(opacity, tone); },
  };
}
