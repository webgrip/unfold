/** What a person set aside on their own Now page: a Work Item (`work:<id>`) or a task Ploeg could not start (`task:<provider>:<externalId>`). */
export type NowSnooze = {
  key: string;
  fingerprint: string;
  kind: 'snooze' | 'dismiss';
  untilAt: string | null;
  createdAt: string;
};

/** How long a snooze lasts: a day, a week, or until the item changes. */
export type SnoozeLength = '1d' | '1w' | 'change';

/** The most snoozes one person keeps; setting one more drops their oldest. */
export const maxNowSnoozes = 200;

/** How long a snooze that waits for a change is kept when the item never changes. */
export const snoozeRetentionDays = 90;

const lengths: Record<SnoozeLength, number | null> = { '1d': 24 * 60 * 60 * 1000, '1w': 7 * 24 * 60 * 60 * 1000, change: null };
const keyPattern = /^(?:work:[A-Za-z0-9_.:-]{1,100}|task:[a-z][a-z0-9_-]{0,31}:[^\s\u0000-\u001f]{1,200})$/;

/** Why a snooze request was refused, with the HTTP status and error code the API answers with. */
export class SnoozeError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

/** Reads one snooze key, or throws a {@link SnoozeError}. */
export function snoozeKey(value: unknown): string {
  if (typeof value !== 'string' || !keyPattern.test(value)) throw new SnoozeError(400, 'snooze_key', 'The key is work:<Work Item id> or task:<provider>:<task id>.');
  return value;
}

/**
 * Reads a `PUT /api/now/snoozes` body into the snooze to keep, with its end computed from `now`. A dismissal is for a
 * task Ploeg could not start only, and always lasts until that refusal changes.
 */
export function parseSnooze(body: Record<string, unknown>, now: Date): NowSnooze {
  const key = snoozeKey(body.key);
  if (typeof body.fingerprint !== 'string' || !body.fingerprint || body.fingerprint.length > 200) throw new SnoozeError(400, 'snooze_fingerprint', 'The fingerprint is text between 1 and 200 characters.');
  const kind = body.kind === undefined ? 'snooze' : body.kind;
  if (kind !== 'snooze' && kind !== 'dismiss') throw new SnoozeError(400, 'snooze_kind', 'Kind is snooze or dismiss.');
  const length = body.until === undefined && kind === 'dismiss' ? 'change' : body.until;
  if (typeof length !== 'string' || !(length in lengths)) throw new SnoozeError(400, 'snooze_until', 'Until is 1d, 1w or change.');
  if (kind === 'dismiss' && (!key.startsWith('task:') || length !== 'change')) throw new SnoozeError(400, 'snooze_dismiss', 'Only a task Ploeg could not start can be dismissed, and a dismissal lasts until it changes.');
  const span = lengths[length as SnoozeLength];
  return { key, fingerprint: body.fingerprint, kind, untilAt: span === null ? null : new Date(now.getTime() + span).toISOString(), createdAt: now.toISOString() };
}
