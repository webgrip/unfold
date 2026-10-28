import { state } from './state.js';
import { api } from './api.js';
import { waitingGroup } from './reasons.js';

/** How old a refusal is before Now folds it away into "older refusals", which do not count as needing you. */
export const olderRefusalAfter = 7 * 24 * 60 * 60 * 1000;

/**
 * The snooze key of a waiting Work Item (`work:<id>`) or of a task Ploeg could not start (`task:<provider>:<externalId>`).
 * @param {object} entry
 * @param {'work'|'task'} kind
 * @returns {string}
 */
export function snoozeKey(entry, kind) {
  return kind === 'task' ? `task:${entry?.provider ?? ''}:${entry?.externalId ?? ''}` : `work:${entry?.id ?? ''}`;
}

/**
 * What a snooze remembers to notice a change: a Work Item's state and `updatedAt`, a refusal's code and `refusedAt`.
 * When it differs, the row shows again.
 * @param {object} entry
 * @param {'work'|'task'} kind
 * @returns {string}
 */
export function snoozeFingerprint(entry, kind) {
  return kind === 'task' ? `${entry?.code ?? ''}|${entry?.refusedAt ?? ''}` : `${entry?.state ?? ''}|${entry?.updatedAt ?? ''}`;
}

const time = value => { const at = typeof value === 'number' ? value : Date.parse(value ?? ''); return Number.isFinite(at) ? at : null; };

function holds(snoozes, entry, kind, now) {
  const found = snoozes.get(snoozeKey(entry, kind));
  if (!found || found.fingerprint !== snoozeFingerprint(entry, kind)) return null;
  if (found.untilAt) {
    const until = time(found.untilAt);
    if (until === null || until <= now) return null;
  }
  return found;
}

/**
 * Sorts a Now response for one person: Unstick rows they snoozed or dismissed, still unchanged and not yet due, leave
 * `waiting` and `refused` for `snoozed`; refusals older than `olderRefusalAfter` leave `refused` for `older`. `data`
 * holds what is left, so every count made from it leaves both out. A missing or failed list stays as it is.
 * @param {object|null} data A `GET /api/ploeg/now` response.
 * @param {{ key: string, fingerprint: string, kind: string, untilAt: string|null }[]|null|undefined} snoozes
 * @param {number} [now]
 * @returns {{ data: object|null, snoozed: { entry: object, kind: 'work'|'task', snooze: object }[], older: object[] }}
 */
export function sortOut(data, snoozes, now = Date.now()) {
  if (!data) return { data, snoozed: [], older: [] };
  const byKey = new Map((Array.isArray(snoozes) ? snoozes : []).map(snooze => [snooze.key, snooze]));
  const snoozed = [];
  const older = [];
  const next = { ...data };
  if (!data.errors?.waiting && Array.isArray(data.waiting) && byKey.size) {
    next.waiting = data.waiting.filter(entry => {
      const snooze = waitingGroup(entry) === 'needs' ? holds(byKey, entry, 'work', now) : null;
      if (snooze) snoozed.push({ entry, kind: 'work', snooze });
      return !snooze;
    });
  }
  if (!data.errors?.refused && Array.isArray(data.refused)) {
    next.refused = data.refused.filter(entry => {
      const snooze = holds(byKey, entry, 'task', now);
      if (snooze) { snoozed.push({ entry, kind: 'task', snooze }); return false; }
      const at = time(entry.refusedAt);
      if (at !== null && now - at > olderRefusalAfter) { older.push(entry); return false; }
      return true;
    });
  }
  return { data: next, snoozed, older };
}

function keep(answer) {
  state.nowSnoozes = Array.isArray(answer?.snoozes) ? answer.snoozes : [];
  return answer;
}

/** Reads the signed-in person's snoozes into `state.nowSnoozes`; a failed read keeps what was known. */
export async function loadSnoozes() {
  const epoch = state.epoch;
  try { const answer = await api('/api/now/snoozes'); if (state.epoch === epoch) keep(answer); }
  catch {}
  return state.nowSnoozes ?? [];
}

/**
 * Snoozes a Work Item or refusal for the signed-in person, or dismisses a refusal (`kind` 'dismiss', until it changes).
 * @param {object} entry
 * @param {'work'|'task'} target
 * @param {'1d'|'1w'|'change'} until
 * @param {'snooze'|'dismiss'} [kind]
 */
export async function snooze(entry, target, until, kind = 'snooze') {
  return keep(await api('/api/now/snoozes', { method: 'PUT', body: JSON.stringify({ key: snoozeKey(entry, target), fingerprint: snoozeFingerprint(entry, target), until, kind }) }));
}

/** Ends one of the signed-in person's snoozes by its key. */
export async function unsnooze(key) {
  return keep(await api(`/api/now/snoozes?key=${encodeURIComponent(key)}`, { method: 'DELETE' }));
}

