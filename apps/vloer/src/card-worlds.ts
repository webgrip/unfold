import type { PloegCard } from './ploeg.ts';

/** What a decoration may set as its world: one of the forge's worlds, or `off` for the theme's art. Mirrors `public/cards/skins/forge/world/rules.js`. */
export const worldChoices = Object.freeze(['islands', 'deepsea', 'city', 'off']);
/** The times of day and the whole days live at which each is earned. */
export const timesOfDay = Object.freeze([
  Object.freeze({ key: 'dawn', days: 0 }),
  Object.freeze({ key: 'morning', days: 7 }),
  Object.freeze({ key: 'noon', days: 30 }),
  Object.freeze({ key: 'sunset', days: 90 }),
  Object.freeze({ key: 'golden', days: 180 }),
  Object.freeze({ key: 'night', days: 365 }),
]);
/** The weathers a decoration may pick. */
export const weathers = Object.freeze(['clear', 'rain', 'snow', 'fireflies']);
/** The card fact that unlocks each placeable thing. */
export type UnlockRule = 'start' | 'merged' | 'proven' | 'mended';
/** The things a person can place, and what unlocks each. */
export const worldObjects: readonly { type: string; unlock: UnlockRule }[] = Object.freeze([
  Object.freeze({ type: 'crystal', unlock: 'start' as const }),
  Object.freeze({ type: 'lantern', unlock: 'start' as const }),
  Object.freeze({ type: 'tree', unlock: 'start' as const }),
  Object.freeze({ type: 'windmill', unlock: 'merged' as const }),
  Object.freeze({ type: 'lighthouse', unlock: 'proven' as const }),
  Object.freeze({ type: 'koi', unlock: 'mended' as const }),
]);
/** At most 24 things, inside the ground plane, each with a seed in [0, 1]. */
export const worldLimits = Object.freeze({ objects: 24, x: Object.freeze([-4, 4]) as readonly [number, number], z: Object.freeze([-3, 3]) as readonly [number, number] });
/** How many decorations Vloer keeps per person; the least recently changed are dropped first. */
export const cardWorldLimit = 2000;

export type WorldFacts = { days: number | null; merged: boolean; condition: 'cracked' | 'mended' | null };
export type WorldObject = { t: string; x: number; z: number; s: number };
export type CardWorld = { v: 1; kind: string; tod: string; weather: string; objects: WorldObject[] };

/** A decoration refused with a reason the person can act on. */
export class WorldError extends Error {}

const day = 86_400_000;
const provenDays = 180;
const known = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const inside = (value: unknown, [low, high]: readonly [number, number]): value is number => known(value) && value >= low && value <= high;
const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

/**
 * The facts a card's world reads, from the card itself and the clock: whole days since its release (null until
 * released), whether its state is merged, and its condition. The browser derives the same from the card's view.
 */
export function worldFactsOf(card: PloegCard, now = Date.now()): WorldFacts {
  const at = card.release?.at ? Date.parse(card.release.at) : NaN;
  const days = Number.isFinite(at) ? Math.max(0, Math.floor((now - at) / day)) : null;
  const state = card.condition?.state;
  return { days, merged: card.state === 'merged', condition: state === 'cracked' || state === 'mended' ? state : null };
}

/** Whether a card with `facts` meets `rule`. */
export function ruleMet(rule: UnlockRule, facts: WorldFacts): boolean {
  if (rule === 'start') return true;
  if (rule === 'merged') return facts.merged;
  if (rule === 'proven') return known(facts.days) && facts.days >= provenDays;
  return facts.condition === 'mended';
}

/** Whether a card with `facts` lets its holder place `type`. */
export function objectUnlocked(type: unknown, facts: WorldFacts): boolean {
  const entry = worldObjects.find(item => item.type === type);
  return Boolean(entry) && ruleMet(entry!.unlock, facts);
}

/** Whether a card with `facts` has earned the time of day `key`; `auto` always is. */
export function timeUnlocked(key: unknown, facts: WorldFacts): boolean {
  if (key === 'auto') return true;
  const step = timesOfDay.find(entry => entry.key === key);
  return Boolean(step) && (step!.days === 0 || (known(facts.days) && facts.days >= step!.days));
}

const unlockWords: Record<UnlockRule, string> = { start: '', merged: 'unlocks when the card merges', proven: 'unlocks at 180 days live', mended: 'unlocks when a crack is mended' };

/**
 * Checks a decoration strictly and returns its normalized form, or throws a `WorldError` that says what is wrong:
 * only the keys `v`, `kind`, `tod`, `weather` and `objects`; a known world, time of day and weather; at most 24
 * things, each `{ t, x, z, s }` with a known type, inside the ground plane and a seed in [0, 1]; and every time of day
 * and thing earned by the card's facts now, never on the browser's word. Decorations are cosmetic: nothing here reads
 * or changes a grade, a finish, rarity, a pull or the odds.
 */
export function validateWorld(input: unknown, facts: WorldFacts): CardWorld {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new WorldError('world must be an object.');
  const data = input as Record<string, unknown>;
  for (const key of Object.keys(data)) if (!['v', 'kind', 'tod', 'weather', 'objects'].includes(key)) throw new WorldError(`A decoration has no field ${key}.`);
  if (data.v !== undefined && data.v !== 1) throw new WorldError('v must be 1.');
  if (typeof data.kind !== 'string' || !worldChoices.includes(data.kind)) throw new WorldError(`kind must be one of ${worldChoices.join(', ')}.`);
  if (data.tod !== 'auto' && !timesOfDay.some(step => step.key === data.tod)) throw new WorldError(`tod must be auto or one of ${timesOfDay.map(step => step.key).join(', ')}.`);
  if (!timeUnlocked(data.tod, facts)) throw new WorldError(`${String(data.tod)} is not earned yet: it unlocks at ${timesOfDay.find(step => step.key === data.tod)!.days} days live.`);
  if (typeof data.weather !== 'string' || !weathers.includes(data.weather)) throw new WorldError(`weather must be one of ${weathers.join(', ')}.`);
  if (!Array.isArray(data.objects) || data.objects.length > worldLimits.objects) throw new WorldError(`objects must list at most ${worldLimits.objects} things.`);
  const objects = (data.objects as unknown[]).map((value, index): WorldObject => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['t', 'x', 'z', 's'].includes(key))) throw new WorldError(`objects[${index}] must be { t, x, z, s }.`);
    const item = value as Record<string, unknown>;
    const entry = worldObjects.find(candidate => candidate.type === item.t);
    if (!entry) throw new WorldError(`objects[${index}].t must be one of ${worldObjects.map(candidate => candidate.type).join(', ')}.`);
    if (!ruleMet(entry.unlock, facts)) throw new WorldError(`objects[${index}]: a ${entry.type} ${unlockWords[entry.unlock]}.`);
    if (!inside(item.x, worldLimits.x) || !inside(item.z, worldLimits.z)) throw new WorldError(`objects[${index}] must stand inside the world: x from ${worldLimits.x[0]} to ${worldLimits.x[1]}, z from ${worldLimits.z[0]} to ${worldLimits.z[1]}.`);
    if (!inside(item.s, [0, 1])) throw new WorldError(`objects[${index}].s must be a seed from 0 to 1.`);
    return { t: entry.type, x: round(item.x as number, 2), z: round(item.z as number, 2), s: round(item.s as number, 3) };
  });
  return { v: 1, kind: data.kind, tod: data.tod as string, weather: data.weather, objects };
}

/**
 * A stored decoration as the card can show it now: things it no longer has earned (a mend that reopened) are left
 * out and a time of day it no longer has earned falls back to `auto`. An unreadable decoration is null.
 */
export function shownWorld(stored: unknown, facts: WorldFacts): CardWorld | null {
  if (!stored || typeof stored !== 'object') return null;
  const data = stored as Record<string, unknown>;
  if (typeof data.kind !== 'string' || !worldChoices.includes(data.kind)) return null;
  const objects = (Array.isArray(data.objects) ? data.objects : [])
    .filter((item): item is WorldObject => Boolean(item) && typeof item === 'object' && objectUnlocked((item as WorldObject).t, facts) && inside((item as WorldObject).x, worldLimits.x) && inside((item as WorldObject).z, worldLimits.z) && inside((item as WorldObject).s, [0, 1]))
    .slice(0, worldLimits.objects)
    .map(({ t, x, z, s }) => ({ t, x, z, s }));
  const tod = typeof data.tod === 'string' && (data.tod === 'auto' || timesOfDay.some(step => step.key === data.tod)) && timeUnlocked(data.tod, facts) ? data.tod : 'auto';
  const weather = typeof data.weather === 'string' && weathers.includes(data.weather) ? data.weather : 'clear';
  return { v: 1, kind: data.kind, tod, weather, objects };
}
