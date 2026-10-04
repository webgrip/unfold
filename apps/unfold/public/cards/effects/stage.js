import { tierSpecs } from './tiers.js';
import { momentHeadline } from './moments.js';

/** The most a ceremony moves the card: 6 px and 1.5° of shake, trauma decaying by 1.2 a second. */
export const shakeLimits = Object.freeze({ px: 6, degrees: 1.5, decay: 1.2 });

const hostProperties = ['--fx-x', '--fx-y', '--fx-r', '--fx-s'];
const smooth = t => Math.sin(t * 13.1) * 0.5 + Math.sin(t * 23.7 + 1.3) * 0.3 + Math.sin(t * 41.9 + 2.1) * 0.2;

/**
 * The director's stage in a page: it plays a ceremony's cues on the target card and the shared overlay. The card
 * (`target.host`, an `<unfold-card>`) gets its skin's reaction through `host.playMoment(moment, api)`, and the
 * anticipation lift, impact squash and shake through custom properties set with the CSSOM; the overlay draws the
 * particles, the ring, the flash and a takeover's dim; the title layer shows the words; the sound player plays the
 * cue; the time scale carries hit-stop and slow motion to a live skin. Every flash, a skin's included, asks the
 * director's flash ledger first. `play` resolves once the ceremony has settled; `skip` settles it at once.
 * @param {{ overlay: object, title: object, sound: { play: Function }, time: object, flash: (opacity: number, tone: string) => number, now?: () => number }} parts
 */
export function createDomStage({ overlay, title, sound, time, flash, now = () => performance.now() }) {
  const runs = new Map();

  function reset(host) {
    if (!host) return;
    delete host.dataset.fx;
    delete host.dataset.fxPulse;
    for (const name of hostProperties) host.style.removeProperty(name);
  }

  function play(ticket, timeline) {
    const host = ticket.target?.host ?? null;
    const rect = () => (host?.isConnected ? host.getBoundingClientRect() : null);
    const controller = new AbortController();
    const motion = { trauma: 0, impactAt: -1, juice: 0, anticipate: null, seed: ticket.id * 7.3 };
    let endCues;
    const ended = new Promise(resolve => { endCues = resolve; });
    let skinDone = Promise.resolve();
    let finish;
    const finished = new Promise(resolve => { finish = resolve; });
    const run = { ticket, controller, host, finish, frame: 0 };
    runs.set(ticket, run);
    const card = ticket.target?.card ?? host?.card ?? null;
    const api = Object.freeze({
      moment: ticket.moment,
      tier: ticket.tier,
      mode: timeline.mode,
      durationMs: timeline.durationMs,
      impactAt: timeline.cues.find(cue => cue.type === 'impact')?.at ?? 0,
      card,
      before: ticket.target?.before ?? null,
      signal: controller.signal,
      time,
      hitStop: ms => { if (timeline.mode === 'full') time.hitStop(ms); },
      slowMo: (scale, ms) => { if (timeline.mode === 'full') time.slowMo(scale, ms); },
      flash: (opacity, tone = 'white') => flash(opacity, tone),
      emit: (shape, options = {}) => { if (timeline.mode === 'full') overlay.burst(rect(), { shape, count: Math.min(options.count ?? 12, tierSpecs[ticket.tier].particles), palette: options.palette ?? 'gold' }); },
      sound: (cue, params) => sound.play(cue, params),
    });
    const handlers = {
      skin: () => { try { skinDone = Promise.resolve(host?.playMoment?.(ticket.moment, api)).catch(() => null); } catch { skinDone = Promise.resolve(); } },
      takeover: cue => overlay.dim(rect(), cue.ms),
      anticipate: cue => { if (host) { host.dataset.fx = 'charge'; motion.anticipate = { start: now(), ms: cue.ms, rank: tierSpecs[ticket.tier].rank }; } },
      impact: cue => { motion.anticipate = null; motion.impactAt = now(); motion.juice = cue.juice; if (host) host.dataset.fx = 'impact'; },
      sound: cue => sound.play(cue.cue, { level: cue.level }),
      hitstop: cue => time.hitStop(cue.ms),
      slowmo: cue => time.slowMo(cue.scale, cue.ms),
      flash: cue => { const allowed = flash(cue.opacity, cue.tone); if (allowed) overlay.flash(rect(), allowed, cue.tone, cue.ms); },
      shake: cue => { motion.trauma = Math.max(motion.trauma, cue.trauma); },
      particles: cue => overlay.burst(rect(), { count: cue.count, palette: cue.palette, shape: cue.shape }),
      title: cue => { const words = momentHeadline(ticket.moment); title.show({ kicker: card?.title ?? '', main: words.main, sub: words.sub, tone: cue.tone, mode: cue.mode, tier: ticket.tier, hold: cue.hold, banner: cue.banner, rect: rect(), count: ticket.count }); },
      pulse: () => { if (host && flash(0.18, 'white')) { host.dataset.fxPulse = ''; setTimeout(() => { delete host.dataset.fxPulse; }, 220); } },
      settle: () => { if (host && timeline.mode === 'full') host.dataset.fx = 'settle'; },
    };
    const start = now();
    let index = 0;
    let last = start;
    const cues = timeline.cues;
    const step = () => {
      run.frame = 0;
      if (controller.signal.aborted) return;
      const at = now();
      const elapsed = at - start;
      while (index < cues.length && cues[index].at <= elapsed) { const cue = cues[index++]; try { handlers[cue.type]?.(cue); } catch { continue; } }
      const dt = Math.min(0.05, (at - last) / 1000);
      last = at;
      if (host && timeline.mode === 'full') {
        let x = 0; let y = 0; let r = 0; let s = 1;
        if (motion.anticipate) {
          const k = Math.min(1, (at - motion.anticipate.start) / Math.max(1, motion.anticipate.ms));
          const eased = k * k;
          s = 1 - (0.03 + motion.anticipate.rank * 0.01) * eased;
          y = -(4 + motion.anticipate.rank * 2.7) * eased;
        }
        if (motion.impactAt >= 0) {
          const t = (at - motion.impactAt) / 1000;
          if (t < 0.4) s = 1 - 0.6 * motion.juice * Math.cos(2 * Math.PI * 8.1 * t) * (1 - t / 0.4) ** 3;
        }
        if (motion.trauma > 0) {
          const shake = motion.trauma * motion.trauma;
          const t = elapsed / 1000 + motion.seed;
          x = shakeLimits.px * shake * smooth(t);
          y += shakeLimits.px * shake * smooth(t + 17.3);
          r = shakeLimits.degrees * shake * smooth(t + 41.1);
          motion.trauma = Math.max(0, motion.trauma - shakeLimits.decay * dt);
        }
        host.style.setProperty('--fx-x', `${x.toFixed(2)}px`);
        host.style.setProperty('--fx-y', `${y.toFixed(2)}px`);
        host.style.setProperty('--fx-r', `${r.toFixed(3)}deg`);
        host.style.setProperty('--fx-s', s.toFixed(4));
      }
      if (elapsed >= timeline.durationMs && index >= cues.length) { endCues(); return; }
      run.frame = requestAnimationFrame(step);
    };
    run.frame = requestAnimationFrame(step);
    const timeout = new Promise(resolve => setTimeout(resolve, timeline.durationMs + 600));
    ended.then(() => Promise.race([skinDone, timeout])).then(() => finish());
    timeout.then(() => finish());
    return finished.finally(() => {
      if (run.frame) cancelAnimationFrame(run.frame);
      reset(host);
      runs.delete(ticket);
    });
  }

  return {
    play,
    /** Settles a ceremony at once: the skin jumps to its end state, the overlay and title clear, time runs normally. */
    skip(ticket) {
      const run = runs.get(ticket);
      if (!run) return;
      run.controller.abort();
      overlay.clear();
      title.hide();
      time.reset();
      run.finish();
    },
    /** Shows a new count on the playing title when more of the same moment arrive. */
    count(ticket, count) { if (runs.has(ticket)) title.count(count); },
  };
}
