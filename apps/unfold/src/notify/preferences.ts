import { isTrigger, type TriggerId } from './triggers.ts';

/** Quiet hours: from `start` to `end` (`HH:MM`, 24-hour) in `timeZone`; a window may wrap past midnight. */
export type QuietHours = { start: string; end: string; timeZone: string };
/**
 * What a person chose: the channels by registry id, the triggers, and optional quiet hours. Empty means nothing is sent.
 * `handedOff` is `false` when they turned off notices about work they handed off; absent, those notices are on.
 */
export type Preferences = { channels: string[]; triggers: TriggerId[]; quietHours: QuietHours | null; handedOff?: false };

/** Whether a person gets notices about the work they handed off: on unless they turned it off. */
export const followsHandedOff = (preferences: Preferences): boolean => preferences.handedOff !== false;

/** The choice of a person who never chose: nothing. */
export const noPreferences: Preferences = Object.freeze({ channels: [], triggers: [], quietHours: null }) as Preferences;

/** A refusal with the HTTP status and code the API answers with. */
export class NotifyError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; this.name = 'NotifyError'; }
}
/** Throws a {@link NotifyError}. */
export const refuse = (status: number, code: string, message: string): never => { throw new NotifyError(status, code, message); };

const clock = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutes = (value: string) => { const match = clock.exec(value)!; return Number(match[1]) * 60 + Number(match[2]); };

/** Whether `zone` is an IANA time zone this runtime knows. */
export function validTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length > 64) return false;
  try { new Intl.DateTimeFormat('en-GB', { timeZone: zone }); return true; } catch { return false; }
}

/** Reads a preferences body, keeping only channels in `known`. Refuses an unknown trigger, a bad clock time or time zone, or a `handedOff` that is not a boolean. */
export function parsePreferences(raw: unknown, known: readonly string[]): Preferences {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) refuse(400, 'notify_preferences', 'Send channels, triggers and quietHours.');
  const value = raw as Record<string, unknown>;
  const channels = value.channels ?? [];
  const chosen = value.triggers ?? [];
  if (!Array.isArray(channels) || channels.some(entry => typeof entry !== 'string' || !known.includes(entry))) refuse(400, 'notify_channel', `Choose channels from: ${known.join(', ') || 'none configured'}.`);
  if (!Array.isArray(chosen) || !chosen.every(isTrigger)) refuse(400, 'notify_trigger', 'Choose triggers from the listed ones.');
  let quietHours: QuietHours | null = null;
  if (value.quietHours !== undefined && value.quietHours !== null) {
    const quiet = value.quietHours as Record<string, unknown>;
    if (typeof quiet !== 'object' || typeof quiet.start !== 'string' || typeof quiet.end !== 'string' || !clock.test(quiet.start) || !clock.test(quiet.end) || quiet.start === quiet.end) refuse(400, 'notify_quiet_hours', 'Quiet hours run from one HH:MM to another.');
    if (!validTimeZone(quiet.timeZone)) refuse(400, 'notify_time_zone', 'Choose a time zone such as Europe/Amsterdam.');
    quietHours = { start: quiet.start as string, end: quiet.end as string, timeZone: quiet.timeZone as string };
  }
  if (value.handedOff !== undefined && typeof value.handedOff !== 'boolean') refuse(400, 'notify_handed_off', 'handedOff is true or false.');
  return { channels: [...new Set(channels as string[])], triggers: [...new Set(chosen as TriggerId[])], quietHours, ...(value.handedOff === false ? { handedOff: false as const } : {}) };
}

function localMinutes(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at));
  return Number(parts.find(part => part.type === 'hour')!.value) * 60 + Number(parts.find(part => part.type === 'minute')!.value);
}

/**
 * When the quiet hours around `at` end, in milliseconds, or `null` when `at` is outside them. A window that wraps
 * past midnight (22:00 to 07:00) is quiet from its start until its end the next morning.
 */
export function quietUntil(quiet: QuietHours | null, at: number): number | null {
  if (!quiet) return null;
  const now = localMinutes(at, quiet.timeZone);
  const start = minutes(quiet.start);
  const end = minutes(quiet.end);
  const inside = start < end ? now >= start && now < end : now >= start || now < end;
  if (!inside) return null;
  const wait = (end - now + 1440) % 1440;
  return at - (at % 60_000) + wait * 60_000;
}
