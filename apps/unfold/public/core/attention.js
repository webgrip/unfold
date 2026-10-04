import { state } from './state.js';
import { createPrefs } from './prefs.js';
import { onCountsChange } from './counts.js';
import { live } from './live.js';
import { listReason } from './reasons.js';
import { favicon } from './favicon.js';

/** The localStorage key that lists the waiting spells a tab already announced, so a second open tab stays quiet. */
export const notifiedKey = 'unfold.notified';

const workItemId = /^[1-9][0-9]{0,19}$/;
const summaryAbove = 3;
const keepNotified = 7 * 24 * 60 * 60 * 1000;
const maxNotified = 200;
const notificationIcon = new URL('../android-chrome-192x192.png', import.meta.url).href;
const clip = (text, length) => { const value = String(text ?? '').replace(/\s+/g, ' ').trim(); return value.length > length ? `${value.slice(0, length - 1)}…` : value; };

/** One waiting spell of a Work Item: its id, state and last change. The same item waiting again later is a new spell. */
export function spellKey(item) { return `${item.id}:${item.state}:${item.updatedAt || ''}`; }

/**
 * The waiting items that started waiting since the last read: their id was not waiting then (`previous`, a Set of
 * ids) and this tab has not seen this waiting spell before (`seen`, a Set of {@link spellKey} values).
 */
export function newlyWaiting(previous, items, seen = new Set()) { return items.filter(item => !previous.has(String(item.id)) && !seen.has(spellKey(item))); }

/**
 * The desktop notification for one Work Item that started waiting: its title, what it waits for (with the reason
 * chip when it needs you), its Team and id, a tag that collapses repeats, and the page a click opens.
 * @returns {{ title: string, body: string, tag: string, hash: string }}
 */
export function notificationFor(item) {
  const reason = item.state === 'needs_human' ? listReason(item)?.chip : '';
  const what = item.state === 'awaiting_review' ? 'Ready for your review' : item.state === 'proposed' ? 'Proposed: approve or reject it' : reason ? `Needs you: ${reason}` : 'Needs you';
  return { title: clip(item.title, 120) || `Work Item #${item.id}`, body: [what, clip(item.team, 60), `#${item.id}`].filter(Boolean).join(' · '), tag: `unfold-waiting-${item.id}`, hash: `work/${item.id}` };
}

/**
 * The conflict spell of a waiting Work Item: its id and the head at which Ploeg confirmed its pull request conflicts
 * (Ploeg ADR-0040), or null when it does not conflict. A conflict at a new head is a new spell.
 */
export function conflictKey(item) {
  return item?.state === 'awaiting_review' && item.pullRequest?.mergeState === 'conflicted' ? `${item.id}:conflicted:${item.pullRequest.headSha || ''}` : null;
}

/**
 * The waiting items whose pull request conflicts in a spell the previous read did not hold (`previous`, a Set of
 * {@link conflictKey} values) and this tab has not seen (`seen`).
 */
export function newlyConflicted(previous, items, seen = new Set()) {
  return items.filter(item => { const key = conflictKey(item); return key !== null && !previous.has(key) && !seen.has(key); });
}

/** The desktop notification for a waiting Work Item whose pull request started to conflict: "PR #N now conflicts". */
export function conflictNotification(item) {
  const number = Number.isInteger(item.pullRequest?.number) && item.pullRequest.number > 0 ? `PR #${item.pullRequest.number}` : 'Its pull request';
  return { title: clip(item.title, 120) || `Work Item #${item.id}`, body: [`${number} now conflicts`, clip(item.team, 60), `#${item.id}`].filter(Boolean).join(' · '), tag: `unfold-conflict-${item.id}`, hash: `work/${item.id}` };
}

/** The one notification that stands in for several items that started waiting at once. */
export function summaryNotification(total) {
  return { title: `${total} new items wait on you`, body: 'Open Unfold to see what needs you.', tag: 'unfold-waiting', hash: 'now' };
}

/**
 * The waiting rows of a `GET /api/ploeg/now` response, or null when the waiting group is unknown (missing or failed).
 * @returns {object[] | null}
 */
export function waitingRows(data) {
  return data && !data.errors?.waiting && Array.isArray(data.waiting) ? data.waiting.filter(item => item && workItemId.test(String(item.id))) : null;
}

/**
 * Creates the attention signals: the favicon dot and the opt-in desktop notifications. `env` supplies
 * `favicon(visible)`, `notifications()` (the Notification constructor or null), `secure()` (a secure context),
 * `storage()` (localStorage), `attentive()` (the tab is visible and focused) and `open(hash)` (focus the tab and
 * route). The first list of waiting items after loading is a baseline and never notifies; later reads notify once
 * per waiting spell that started since the previous read, only while notifications are on and the person is
 * looking elsewhere. Several at once become one summary, and a spell another tab announced stays quiet.
 */
export function createAttention(env) {
  let previous = null;
  let previousConflicts = null;
  const seen = new Set();
  let broken = false;
  const store = createPrefs(() => env.storage());
  const wanted = () => store.get('notify') === true;
  const want = value => { store.set('notify', value); };

  function claim(items, now, key = spellKey) {
    let list = [];
    try { const parsed = JSON.parse(env.storage()?.getItem(notifiedKey) || '[]'); if (Array.isArray(parsed)) list = parsed.filter(entry => Array.isArray(entry) && typeof entry[0] === 'string' && now - Number(entry[1]) < keepNotified); } catch {}
    const taken = new Set(list.map(entry => entry[0]));
    const mine = items.filter(item => !taken.has(key(item)));
    list.push(...mine.map(item => [key(item), now]));
    try { env.storage()?.setItem(notifiedKey, JSON.stringify(list.slice(-maxNotified))); } catch {}
    return mine;
  }

  function send(Api, message) {
    try {
      const shown = new Api(message.title, { body: message.body, tag: message.tag, icon: notificationIcon, lang: 'en' });
      shown.onclick = () => { env.open(message.hash); shown.close(); };
      return true;
    } catch { broken = true; return false; }
  }

  const attention = {
    /**
     * Takes the latest counts and waiting rows: shows the favicon dot while `waiting` is above zero, and sends a
     * notification for each item that started waiting since the previous rows, and for each waiting item whose
     * pull request started to conflict at a head not announced before. `items` null means unknown and keeps the
     * previous rows. Returns the notifications it sent.
     */
    update({ waiting, items = null, now = Date.now() } = {}) {
      env.favicon(typeof waiting === 'number' && waiting > 0);
      if (!Array.isArray(items)) return [];
      const rows = items.filter(item => item && workItemId.test(String(item.id)));
      const fresh = previous ? newlyWaiting(previous, rows, seen) : [];
      const freshIds = new Set(fresh.map(item => String(item.id)));
      const conflicts = previousConflicts ? newlyConflicted(previousConflicts, rows, seen).filter(item => !freshIds.has(String(item.id))) : [];
      previous = new Set(rows.map(item => String(item.id)));
      previousConflicts = new Set(rows.map(conflictKey).filter(key => key !== null));
      for (const item of rows) { seen.add(spellKey(item)); const key = conflictKey(item); if (key !== null) seen.add(key); }
      if ((!fresh.length && !conflicts.length) || attention.status() !== 'on' || env.attentive()) return [];
      const Api = env.notifications();
      const mine = claim(fresh, now);
      const mineConflicts = claim(conflicts, now, conflictKey);
      const total = mine.length + mineConflicts.length;
      const messages = total > summaryAbove ? [summaryNotification(total)] : [...mine.map(notificationFor), ...mineConflicts.map(conflictNotification)];
      return messages.filter(message => send(Api, message));
    },
    /** Forgets the waiting rows and hides the dot, for example after signing out. */
    reset() { previous = null; previousConflicts = null; env.favicon(false); },
    /**
     * Whether desktop notifications can and do run: `unsupported` (no Notification API, or it refused to show
     * one), `insecure` (not a secure context), `denied` (blocked in the browser), `off`, or `on`.
     * @returns {'unsupported' | 'insecure' | 'denied' | 'off' | 'on'}
     */
    status() {
      const Api = env.notifications();
      if (!Api || broken) return 'unsupported';
      if (!env.secure()) return 'insecure';
      if (Api.permission === 'denied') return 'denied';
      return wanted() && Api.permission === 'granted' ? 'on' : 'off';
    },
    /**
     * Turns desktop notifications on. Call it straight from a click or key press: the browser asks for
     * permission only during a user gesture. Resolves to the new status.
     */
    async enable() {
      const Api = env.notifications();
      if (!Api || broken || !env.secure()) return attention.status();
      const permission = Api.permission === 'granted' ? 'granted' : await Api.requestPermission();
      if (permission === 'granted') want(true);
      return attention.status();
    },
    /** Turns desktop notifications off for this browser. */
    disable() { want(false); return attention.status(); },
  };
  return attention;
}

/** The attention signals of this page. */
export const attention = createAttention({
  favicon: visible => favicon.show(visible),
  notifications: () => typeof globalThis.Notification === 'function' ? globalThis.Notification : null,
  secure: () => globalThis.isSecureContext !== false,
  storage: () => globalThis.localStorage,
  attentive: () => globalThis.document?.visibilityState === 'visible' && globalThis.document.hasFocus(),
  open: hash => { globalThis.focus?.(); location.hash = hash; },
});

let installed = false;

/**
 * Connects the attention signals to the counts: every counts change updates the favicon dot and may notify.
 * Counts listeners that receive the Now response pass it on; otherwise the Now page's last response is used.
 * Signing out clears the dot at the next heartbeat. Safe to call more than once.
 */
export function installAttention() {
  if (installed) return;
  installed = true;
  onCountsChange((...args) => attention.update({ waiting: state.counts?.waiting, items: waitingRows(args.length ? args[0] : state.now?.data) }));
  live.subscribe(() => { if (!state.bootstrap) attention.reset(); });
}
