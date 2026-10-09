export const maxBatch = 50;
export const flushIntervalMs = 10_000;

const forgeHosts = /(^|\.)(forgejo|gitea|gitlab|github)\./;
const trackerHosts = /(^|\.)(vikunja|clickup)\./;

/**
 * Names what a followed link leads to, for `link_out.opened`: `pr` for a pull or merge request, `tracker` for an
 * issue or task, `forge` for another repository page and `docs` for documentation. Returns null for a link that
 * stays inside Unfold or that none of these describe, so nothing is recorded for it.
 * @param {string} href
 * @param {string} origin
 * @returns {'pr' | 'tracker' | 'forge' | 'docs' | null}
 */
export function linkOutTarget(href, origin) {
  let url;
  try { url = new URL(href, origin); } catch { return null; }
  if (url.origin === origin || !['http:', 'https:'].includes(url.protocol)) return null;
  const path = url.pathname;
  if (/\/(pulls?|merge_requests)\/\d+(\/|$)/.test(path)) return 'pr';
  if (trackerHosts.test(url.hostname) || /\/(issues|tasks)\/\d+(\/|$)/.test(path)) return 'tracker';
  if (url.hostname.startsWith('docs.') || /\/docs(\/|$)/.test(path)) return 'docs';
  if (forgeHosts.test(url.hostname) || /\/(commit|commits|tree|blob|src|compare)\//.test(path)) return 'forge';
  return null;
}

/**
 * The fields of `screen.viewed` for a route: the view's id as the screen, and the Work Item id when the path
 * names one that fits in a safe integer.
 * @param {string} view
 * @param {string} path
 * @returns {{ screen: string, workItemId?: number }}
 */
export function screenFields(view, path) {
  const item = /^work\/([1-9][0-9]{0,15})$/.exec(path);
  const id = item ? Number(item[1]) : NaN;
  return { screen: view, ...(Number.isSafeInteger(id) ? { workItemId: id } : {}) };
}

/**
 * A per-tab queue of product events. It records nothing until `configure(true)`, holds at most one batch per send,
 * and hands batches to `send` oldest first. The session id lives only in this tab's memory.
 * @param {{ send: (events: object[]) => void, now?: () => string, session?: string }} options
 */
export function createInsightQueue({ send, now = () => new Date().toISOString(), session = crypto.randomUUID() }) {
  let enabled = false;
  let pending = [];
  function flush() {
    while (pending.length) send(pending.splice(0, maxBatch));
  }
  return {
    session,
    configure(on) { enabled = Boolean(on); if (!enabled) pending = []; },
    track(name, { screen, workItemId, shiftId, props } = {}) {
      if (!enabled) return;
      pending.push({ name, at: now(), session, ...(screen ? { screen } : {}), ...(Number.isSafeInteger(workItemId) ? { workItemId } : {}), ...(Number.isSafeInteger(shiftId) ? { shiftId } : {}), ...(props ? { props } : {}) });
      if (pending.length >= maxBatch) flush();
    },
    flush,
    size: () => pending.length,
  };
}

function post(events) {
  fetch('/api/insight/events', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Unfold-Request': '1' }, body: JSON.stringify({ events }) }).catch(() => {});
}

/** The application's queue. `startInsight` flushes it every ten seconds and whenever the tab is hidden. */
export const insight = createInsightQueue({ send: post });

/** Starts the periodic and on-hide flush of the application's queue. */
export function startInsight() {
  setInterval(insight.flush, flushIntervalMs);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') insight.flush(); });
}
