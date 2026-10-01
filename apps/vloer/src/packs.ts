import { createHmac } from 'node:crypto';
import type { PloegCard } from './ploeg.ts';

const day = 86_400_000;

/** The version of the published odds table. A change to any probability gets a new version; stored pulls keep the version they were drawn with. */
export const oddsVersion = '2026.1';

/**
 * The published odds of the foil pattern a first pull draws, in basis points (1/100 of a percent), over the sixteen
 * patterns the forge skin draws. They sum to 10 000. They do not depend on rarity, grade, finish or any other card fact.
 */
export const patternOdds = Object.freeze([
  Object.freeze({ key: 'none', label: 'Plain', basisPoints: 2400 }),
  Object.freeze({ key: 'holo', label: 'Holo', basisPoints: 1400 }),
  Object.freeze({ key: 'reverse', label: 'Reverse holo', basisPoints: 1100 }),
  Object.freeze({ key: 'rainbow', label: 'Rainbow', basisPoints: 900 }),
  Object.freeze({ key: 'etched', label: 'Etched', basisPoints: 800 }),
  Object.freeze({ key: 'glitter', label: 'Glitter', basisPoints: 700 }),
  Object.freeze({ key: 'cosmos', label: 'Cosmos', basisPoints: 600 }),
  Object.freeze({ key: 'crackedice', label: 'Cracked ice', basisPoints: 500 }),
  Object.freeze({ key: 'liquid', label: 'Liquid metal', basisPoints: 400 }),
  Object.freeze({ key: 'prism', label: 'Prism', basisPoints: 350 }),
  Object.freeze({ key: 'galaxy', label: 'Galaxy', basisPoints: 300 }),
  Object.freeze({ key: 'refractor', label: 'Refractor', basisPoints: 250 }),
  Object.freeze({ key: 'lenticular', label: 'Lenticular', basisPoints: 150 }),
  Object.freeze({ key: 'gold', label: 'Gold', basisPoints: 80 }),
  Object.freeze({ key: 'blacklabel', label: 'Black chrome', basisPoints: 50 }),
  Object.freeze({ key: 'superfractor', label: 'Superfractor', basisPoints: 20 }),
]);

/** How many alternate art presets an alt-art pull chooses from, evenly: every forge preset except the card's own. */
export const altArtChoices = 14;

/** The published odds of the cosmetic extras, each drawn independently of the pattern and of each other, in basis points. */
export const extraOdds = Object.freeze([
  Object.freeze({ key: 'altArt', label: 'Alternate art', basisPoints: 1000, detail: `One of the ${altArtChoices} other art presets, each equally likely, with an "Alt art" stamp` }),
  Object.freeze({ key: 'fullArt', label: 'Full-art frame', basisPoints: 800, detail: 'The art runs behind the whole face' }),
  Object.freeze({ key: 'goldSignature', label: 'Gold signature', basisPoints: 500, detail: "The steward's signature in gold ink" }),
]);

/** The published odds, as the API and the odds page serve them. */
export function publishedOdds() {
  return { version: oddsVersion, scale: 10_000, patterns: patternOdds.map(entry => ({ ...entry })), extras: extraOdds.map(entry => ({ ...entry })), altArtChoices };
}

export type Pull = { pattern: string; altArt: number | null; fullArt: boolean; goldSignature: boolean; oddsVersion: string; message: string; digest: string };

/**
 * Draws a first pull for one card copy. The draw is HMAC-SHA256 over `userId|workItemId|packId` with the server's pull
 * key, so the same inputs always give the same pull and nobody without the key can predict one. Bytes 0–3 pick the
 * pattern from `patternOdds`; bytes 4–7, 8–11 and 12–15 decide alternate art, the full-art frame and the gold signature
 * independently; bytes 16–19 pick which alternate art preset.
 */
export function drawPull(key: Buffer, userId: string, workItemId: string, packId: string): Pull {
  const message = `${userId}|${workItemId}|${packId}`;
  const digest = createHmac('sha256', key).update(message).digest();
  const draw = (offset: number) => Math.floor((digest.readUInt32BE(offset) / 2 ** 32) * 10_000);
  let pick = draw(0);
  let pattern = patternOdds[patternOdds.length - 1].key;
  for (const entry of patternOdds) { if (pick < entry.basisPoints) { pattern = entry.key; break; } pick -= entry.basisPoints; }
  const hit = (offset: number, key: string) => draw(offset) < extraOdds.find(entry => entry.key === key)!.basisPoints;
  return {
    pattern,
    altArt: hit(4, 'altArt') ? digest.readUInt32BE(16) % altArtChoices : null,
    fullArt: hit(8, 'fullArt'),
    goldSignature: hit(12, 'goldSignature'),
    oddsVersion,
    message,
    digest: digest.toString('hex'),
  };
}

/** The finish ladder: days live at which each finish is earned. It matches `finishLadder` in `public/cards/card-model.js`. */
export const finishSteps = Object.freeze([
  Object.freeze({ key: 'matte', days: 0 }),
  Object.freeze({ key: 'foil', days: 7 }),
  Object.freeze({ key: 'holo', days: 30 }),
  Object.freeze({ key: 'prism', days: 90 }),
  Object.freeze({ key: 'gilded', days: 180 }),
  Object.freeze({ key: 'infinity', days: 365 }),
]);

export type MomentKind = 'minted' | 'merged' | 'released' | 'finish' | 'cracked' | 'mended';
export type Moment = { workItemId: string; kind: MomentKind; at: string; detail: Record<string, string | number> };

const time = (value: unknown): number | null => { if (typeof value !== 'string' || !value) return null; const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : null; };
const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');

/**
 * The moments of a card up to `now`, oldest first, derived from its facts only: minted (the first Run), each merged
 * play, released (the release time), each finish step crossed (release time plus the step's days), each confirmed
 * crack and each mend.
 */
export function cardMoments(card: PloegCard, now = Date.now()): Moment[] {
  const id = card.workItemId;
  const moments: Moment[] = [];
  const add = (kind: MomentKind, at: number | null, detail: Record<string, string | number> = {}) => { if (at !== null && at <= now) moments.push({ workItemId: id, kind, at: iso(at), detail }); };
  const minted = card.events.find(event => event.kind === 'minted');
  add('minted', time(minted?.at) ?? time(card.totals.firstRunAt));
  for (const play of card.plays) if (play.state === 'merged') add('merged', time(play.mergedAt), { number: play.number });
  const released = time(card.release?.at);
  if (released !== null) {
    add('released', released, { source: card.release!.source, environment: card.release!.environment });
    for (let index = 1; index < finishSteps.length; index++) add('finish', released + finishSteps[index].days * day, { from: finishSteps[index - 1].key, to: finishSteps[index].key });
  }
  for (const crack of card.condition?.cracks ?? []) {
    add('cracked', time(crack.confirmedAt), { severity: crack.severity, ...(crack.bug?.ref ? { ref: crack.bug.ref } : {}) });
    if (crack.mended) add('mended', time(crack.mended.at), { ...(crack.bug?.ref ? { ref: crack.bug.ref } : {}), ...(crack.mended.pr !== null ? { pr: crack.mended.pr } : {}) });
  }
  return moments.sort((a, b) => a.at.localeCompare(b.at));
}

/** The time of a card's latest moment, or null when it has none yet. */
export function lastActivity(card: PloegCard, now = Date.now()): string | null {
  return cardMoments(card, now).at(-1)?.at ?? null;
}

export type SprintRule = { lengthDays: number; anchor: string };
export type PeriodRules = { teams: Record<string, SprintRule> };
export type Period = { id: string; kind: 'week' | 'sprint'; start: string; end: string; week?: number; year?: number; team?: string; lengthDays?: number };

/** The ISO 8601 week of a UTC instant: weeks start on Monday 00:00 UTC, and week 1 holds the year's first Thursday. */
export function isoWeek(ms: number): { year: number; week: number; start: number } {
  const date = new Date(ms);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const weekday = (new Date(midnight).getUTCDay() + 6) % 7;
  const start = midnight - weekday * day;
  const thursday = new Date(start + 3 * day);
  const year = thursday.getUTCFullYear();
  const firstThursday = Date.UTC(year, 0, 4);
  const firstStart = firstThursday - ((new Date(firstThursday).getUTCDay() + 6) % 7) * day;
  return { year, week: 1 + Math.round((start - firstStart) / (7 * day)), start };
}

/** The period that holds `ms` for a card of `team`: the team's sprint when configured, otherwise the ISO week. */
export function periodAt(ms: number, team: string, rules: PeriodRules): Period {
  const sprint = rules.teams[team];
  if (sprint) {
    const anchor = Date.parse(`${sprint.anchor}T00:00:00Z`);
    const length = sprint.lengthDays * day;
    const start = anchor + Math.floor((ms - anchor) / length) * length;
    return { id: `${team}~${iso(start).slice(0, 10)}`, kind: 'sprint', start: iso(start), end: iso(start + length), team, lengthDays: sprint.lengthDays };
  }
  const week = isoWeek(ms);
  return { id: `${week.year}-W${String(week.week).padStart(2, '0')}`, kind: 'week', start: iso(week.start), end: iso(week.start + 7 * day), week: week.week, year: week.year };
}

/** The period a stored pack id names, or null when the id is not one this configuration produces. */
export function periodById(id: string, rules: PeriodRules): Period | null {
  const week = /^([0-9]{4})-W([0-9]{2})$/.exec(id);
  if (week) {
    const year = Number(week[1]);
    const firstThursday = Date.UTC(year, 0, 4);
    const start = firstThursday - ((new Date(firstThursday).getUTCDay() + 6) % 7) * day + (Number(week[2]) - 1) * 7 * day;
    const period = periodAt(start, '', { teams: {} });
    return period.id === id ? period : null;
  }
  const sprint = /^(.+)~([0-9]{4}-[0-9]{2}-[0-9]{2})$/.exec(id);
  if (sprint && rules.teams[sprint[1]]) {
    const period = periodAt(Date.parse(`${sprint[2]}T00:00:00Z`), sprint[1], rules);
    return period.id === id ? period : null;
  }
  return null;
}

/** The earliest period start a person's packs reach back to: `backfill` whole periods before the period of their first visit. */
export function packFloor(startedAt: number, team: string, rules: PeriodRules, backfill: number): number {
  const first = periodAt(startedAt, team, rules);
  const length = Date.parse(first.end) - Date.parse(first.start);
  return Date.parse(first.start) - backfill * length;
}

export type PackEntry = { workItemId: string; moments: Moment[] };
export type PackPlan = { period: Period; entries: PackEntry[] };

/**
 * Groups card moments into packs: a pack for a period holds every card with at least one moment in it, with those
 * moments. Only periods that start at or after the card's floor count, so a person's history before their first visit
 * (less the backfill) never becomes a stack of packs.
 */
export function planPacks(cards: PloegCard[], rules: PeriodRules, floorFor: (team: string) => number, now = Date.now()): PackPlan[] {
  const plans = new Map<string, PackPlan>();
  for (const card of cards) {
    const floor = floorFor(card.team);
    for (const moment of cardMoments(card, now)) {
      const period = periodAt(Date.parse(moment.at), card.team, rules);
      if (Date.parse(period.start) < floor) continue;
      const plan = plans.get(period.id) ?? { period, entries: [] };
      plans.set(period.id, plan);
      let entry = plan.entries.find(item => item.workItemId === card.workItemId);
      if (!entry) { entry = { workItemId: card.workItemId, moments: [] }; plan.entries.push(entry); }
      entry.moments.push(moment);
    }
  }
  for (const plan of plans.values()) plan.entries.sort((a, b) => a.moments[0].at.localeCompare(b.moments[0].at) || a.workItemId.localeCompare(b.workItemId));
  return [...plans.values()].sort((a, b) => a.period.start.localeCompare(b.period.start) || a.period.id.localeCompare(b.period.id));
}

/** The roles a copy can carry, in the order that names a copy when one person holds several. */
export const copyRoles = Object.freeze(['developer', 'reviewer', 'qa', 'po', 'acceptor', 'merger']);

/**
 * The copy a person holds of a card: their roles from the roster, the role that names the copy and whether they
 * steward it. Null when none of `logins` is on the roster. `steward` is true only for a login in `verified` (the
 * administrator's mapping), because a self-declared login never attributes a card to anyone.
 */
export function copyOf(card: PloegCard, logins: string[], verified: string[] = []): { role: string; roles: string[]; steward: boolean } | null {
  const mine = new Set(logins.map(login => login.toLowerCase()));
  const trusted = new Set(verified.map(login => login.toLowerCase()));
  const roles = [...new Set(card.roster.filter(person => mine.has(person.name.toLowerCase())).flatMap(person => person.roles))];
  const steward = Boolean(card.steward && trusted.has(card.steward.name.toLowerCase()));
  if (!roles.length && !steward) return null;
  const role = copyRoles.find(entry => roles.includes(entry)) ?? roles[0] ?? 'steward';
  return { role, roles, steward };
}
