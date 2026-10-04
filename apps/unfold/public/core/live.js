import { state } from './state.js';
import { prefs } from './prefs.js';

/** How often the scheduler wakes while nothing is due, so the "Updated … ago" text stays current. */
export const heartbeat = 5000;
/** The longest wait after repeated failures. */
export const maxBackoff = 5 * 60 * 1000;

/**
 * Creates the one live-update scheduler. `env` supplies the clock and timers (`now`, `setTimeout`,
 * `clearTimeout`) and the conditions (`visible`, `signedIn`, `blocked` for an open dialog, `currentView`,
 * `paused`, `setPaused`). A job runs only while the tab is visible (or the job is `hidden`), someone is signed in,
 * no dialog is open, live updates are on, and its view is current (or it is `scope: 'global'`). A failing job backs off
 * exponentially, from its interval up to five minutes. One timer serves every job.
 */
export function createLive(env) {
  const jobs = new Map();
  const listeners = new Set();
  let timer = null;
  let started = false;
  let lastUpdated = null;
  let updatedView = null;
  const record = view => { lastUpdated = env.now(); updatedView = view; };
  const notify = () => { for (const listener of listeners) { try { listener(); } catch {} } };
  const eligible = job => !job.running && (env.visible() || job.hidden) && env.signedIn() && !env.paused() && !env.blocked() && (job.scope === 'global' || env.currentView() === job.id);
  const backoff = job => Math.min(job.interval * 2 ** job.failures, Math.max(maxBackoff, job.interval));

  function schedule() {
    if (timer !== null) { env.clearTimeout(timer); timer = null; }
    if (!started || (!env.visible() && ![...jobs.values()].some(job => job.hidden))) return;
    const now = env.now();
    let next = now + heartbeat;
    for (const job of jobs.values()) if (eligible(job)) next = Math.min(next, job.due);
    timer = env.setTimeout(tick, Math.max(0, next - now));
  }

  async function run(job) {
    job.running = true;
    try { const read = await job.refresh(); job.failures = 0; job.due = env.now() + job.interval; if (read !== false && job.scope !== 'global') record(job.id); }
    catch { job.failures += 1; job.due = env.now() + backoff(job); }
    finally { job.running = false; notify(); schedule(); }
  }

  function tick() {
    timer = null;
    const now = env.now();
    for (const job of jobs.values()) if (eligible(job) && job.due <= now) void run(job);
    notify();
    schedule();
  }

  return {
    /**
     * Registers `refresh` for the view `id` every `interval` ms. `scope: 'global'` runs it on every view; `hidden`
     * lets it run while the tab is hidden too (browsers throttle hidden timers to about once a minute). A refresh
     * that resolves to `false` read nothing, without failing: it neither backs off nor counts as an update.
     * Registering the same id again replaces the job.
     */
    register(id, { interval, refresh, scope = 'view', hidden = false }) {
      if (typeof refresh !== 'function' || !(interval > 0)) throw new Error(`The live job "${id}" needs a refresh function and a positive interval.`);
      jobs.set(id, { id, interval, refresh, scope, hidden, due: env.now() + interval, failures: 0, running: false });
      schedule();
    },
    /** Removes the job `id`. */
    unregister(id) { jobs.delete(id); schedule(); },
    /** Starts the scheduler. */
    start() { started = true; schedule(); },
    /** Stops the scheduler; registered jobs stay. */
    stop() { started = false; schedule(); },
    /** Re-evaluates the conditions now, for example after the tab became visible or a dialog closed. */
    wake() { schedule(); },
    /**
     * Records a successful load by the view `id` (default: the current view): updates `lastUpdated` for that
     * view and restarts its interval.
     */
    touch(id = env.currentView()) {
      record(id);
      const job = jobs.get(id);
      if (job && job.scope !== 'global' && !job.running) { job.due = lastUpdated + job.interval; job.failures = 0; }
      notify(); schedule();
    },
    /** Switches live updates on or off and returns whether they are now paused. */
    toggle() { env.setPaused(!env.paused()); notify(); schedule(); return env.paused(); },
    /** Calls `listener()` after every heartbeat, refresh, touch and toggle. Returns an unsubscribe function. */
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    /**
     * When the current view's data last loaded or refreshed (ms since the epoch), or null when the current
     * view has not recorded a load since it became current. Global jobs never count.
     */
    get lastUpdated() { return updatedView !== null && updatedView === env.currentView() ? lastUpdated : null; },
    /** Whether live updates are off. */
    get paused() { return env.paused(); },
    /** The registered job ids, for tests and diagnostics. */
    get jobs() { return [...jobs.keys()]; },
  };
}

/** The scheduler of this page. */
export const live = createLive({
  now: () => Date.now(),
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: id => globalThis.clearTimeout(id),
  visible: () => globalThis.document?.visibilityState !== 'hidden',
  signedIn: () => Boolean(state.bootstrap),
  blocked: () => Boolean(globalThis.document?.querySelector('dialog[open]')),
  currentView: () => state.view,
  paused: () => !prefs.get('live'),
  setPaused: paused => prefs.set('live', !paused),
});
