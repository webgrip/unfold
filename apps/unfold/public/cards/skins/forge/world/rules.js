/**
 * The rules of a Run card's inner world that do not need WebGL: which worlds exist, which time of day and which
 * placeable things a card has earned from its facts, and what a decoration may hold. `src/card-worlds.ts` mirrors
 * these tables and checks every saved decoration against them on the server; a test keeps the two in step.
 */

/** The worlds the forge can draw inside the art window. */
export const worldKinds = Object.freeze([
  Object.freeze({ key: 'islands', label: 'Sky islands' }),
  Object.freeze({ key: 'deepsea', label: 'Deep sea' }),
  Object.freeze({ key: 'city', label: 'Neon city' }),
]);

/** What a theme or a decoration may choose: one of the worlds, or `off` for the theme's art. */
export const worldChoices = Object.freeze([...worldKinds.map(kind => kind.key), 'off']);

/** The world a forge card without a theme shows. A theme without a `world` shows its art. */
export const skinWorld = 'islands';

/**
 * The times of day, each earned at a number of whole days live, the same steps as the finish ladder. `auto` follows
 * the card: dawn until released, then the latest step it has reached. A decoration may pick any step already earned.
 */
export const timesOfDay = Object.freeze([
  Object.freeze({ key: 'dawn', label: 'Dawn', days: 0 }),
  Object.freeze({ key: 'morning', label: 'Morning', days: 7 }),
  Object.freeze({ key: 'noon', label: 'Noon', days: 30 }),
  Object.freeze({ key: 'sunset', label: 'Sunset', days: 90 }),
  Object.freeze({ key: 'golden', label: 'Golden hour', days: 180 }),
  Object.freeze({ key: 'night', label: 'Night with aurora', days: 365 }),
]);

/** The weathers a decoration may pick. None is earned. */
export const weathers = Object.freeze([
  Object.freeze({ key: 'clear', label: 'Clear' }),
  Object.freeze({ key: 'rain', label: 'Rain' }),
  Object.freeze({ key: 'snow', label: 'Snow' }),
  Object.freeze({ key: 'fireflies', label: 'Fireflies' }),
]);

/**
 * The fact that unlocks each kind of placeable thing: `start` is always open, `merged` needs the card's state to be
 * merged, `proven` needs 180 days live and `mended` needs the card's condition to be mended.
 */
export const unlockRules = Object.freeze({
  start: Object.freeze({ why: '' }),
  merged: Object.freeze({ why: 'Unlocks when the card merges' }),
  proven: Object.freeze({ why: 'Unlocks at 180 days live' }),
  mended: Object.freeze({ why: 'Unlocks when a crack is mended' }),
});

/** The things a person can place in their copy's world, and what unlocks each. */
export const worldObjects = Object.freeze([
  Object.freeze({ type: 'crystal', label: 'Crystal', unlock: 'start' }),
  Object.freeze({ type: 'lantern', label: 'Lantern', unlock: 'start' }),
  Object.freeze({ type: 'tree', label: 'Tree', unlock: 'start' }),
  Object.freeze({ type: 'windmill', label: 'Windmill', unlock: 'merged' }),
  Object.freeze({ type: 'lighthouse', label: 'Lighthouse', unlock: 'proven' }),
  Object.freeze({ type: 'koi', label: 'Gold koi pond', unlock: 'mended' }),
]);

/** The bounds of a decoration: at most 24 things, each inside the ground plane and with a seed in [0, 1]. */
export const worldLimits = Object.freeze({ objects: 24, x: Object.freeze([-4, 4]), z: Object.freeze([-3, 3]) });

/** The things each world starts with, before anyone decorates it; a thing the card has not earned yet is left out. */
export const worldDefaults = Object.freeze({
  islands: Object.freeze([['tree', -0.9, -0.6], ['tree', -0.5, -1.1], ['tree', -1.3, 0.1], ['crystal', 0.9, -0.5], ['lantern', 0.2, 0.9], ['windmill', -0.2, -0.2], ['lighthouse', 1.5, 0.3]]),
  deepsea: Object.freeze([['crystal', 1.4, 0.6], ['crystal', -1.6, 0.4], ['koi', 0.2, 1.0]]),
  city: Object.freeze([['lantern', -0.6, 0.6], ['lantern', 0.6, 0.6], ['crystal', 0, 0.2]]),
});

const provenDays = 180;
const known = value => typeof value === 'number' && Number.isFinite(value);

/**
 * The card facts a world reads, from a `cardView`: whole days live (null until released), whether the card merged,
 * and its condition. A drafting card has none of them.
 * @param {{ release?: { days?: number | null }, state?: { key?: string }, condition?: { state?: string } | null }} view
 * @returns {{ days: number | null, merged: boolean, condition: 'cracked' | 'mended' | null }}
 */
export function worldFacts(view) {
  const days = known(view?.release?.days) && view.release.days >= 0 ? Math.floor(view.release.days) : null;
  const condition = ['cracked', 'mended'].includes(view?.condition?.state) ? view.condition.state : null;
  return { days, merged: view?.state?.key === 'merged', condition };
}

/** Whether a card with `facts` has earned the unlock rule `rule`. */
export function ruleMet(rule, facts) {
  if (rule === 'start') return true;
  if (rule === 'merged') return facts?.merged === true;
  if (rule === 'proven') return known(facts?.days) && facts.days >= provenDays;
  if (rule === 'mended') return facts?.condition === 'mended';
  return false;
}

/** Whether a card with `facts` lets its holder place the thing `type`. */
export function objectUnlocked(type, facts) {
  const entry = worldObjects.find(item => item.type === type);
  return Boolean(entry) && ruleMet(entry.unlock, facts);
}

/** Why a thing is still locked, or an empty string once it is open. */
export function lockedReason(type, facts) {
  const entry = worldObjects.find(item => item.type === type);
  if (!entry) return 'Not a thing a world can hold';
  return ruleMet(entry.unlock, facts) ? '' : unlockRules[entry.unlock].why;
}

/** The time of day `auto` shows for a card with `facts`: dawn until released, then the latest step reached. */
export function autoTimeOfDay(facts) {
  const days = known(facts?.days) ? facts.days : -1;
  return timesOfDay.findLast(step => days >= step.days)?.key ?? 'dawn';
}

/** Whether a card with `facts` has earned the time of day `key`; `auto` always is. */
export function timeUnlocked(key, facts) {
  if (key === 'auto') return true;
  const step = timesOfDay.find(entry => entry.key === key);
  if (!step) return false;
  return step.days === 0 || (known(facts?.days) && facts.days >= step.days);
}

/** The world kind a card shows before anyone decorates it: its theme's `world`, or islands for a forge card without a theme. */
export function themeWorld(view) {
  if (view?.theme) return worldChoices.includes(view.theme.world) ? view.theme.world : 'off';
  return skinWorld;
}

function seededRandom(seed) {
  let state = Math.floor((Number(seed) || 0) * 4294967296) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The decoration everyone sees for a card: the world `kind`, `auto` time of day, clear weather and the world's starting
 * things that the card has earned, each with a seed from the card's own, so the default is the same on every page.
 * @param {string} kind
 * @param {{ days: number | null, merged: boolean, condition: string | null }} facts
 * @param {number} cardSeed The card's seed in [0, 1).
 */
export function defaultWorld(kind, facts, cardSeed = 0) {
  const random = seededRandom(cardSeed);
  const objects = (worldDefaults[kind] ?? []).filter(([type]) => objectUnlocked(type, facts)).map(([t, x, z]) => ({ t, x, z, s: Math.round(random() * 1000) / 1000 }));
  return { v: 1, kind: worldChoices.includes(kind) ? kind : 'off', tod: 'auto', weather: 'clear', objects };
}

const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;
const inside = (value, [low, high]) => known(value) && value >= low && value <= high;

/**
 * Checks a decoration against the limits and the card's facts and returns its normalized form, or throws an Error
 * whose message says what is wrong. The server runs the same checks (`src/card-worlds.ts`) and is the authority.
 * @param {unknown} input
 * @param {{ days: number | null, merged: boolean, condition: string | null }} facts
 */
export function checkWorld(input, facts) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('A decoration must be an object.');
  for (const key of Object.keys(input)) if (!['v', 'kind', 'tod', 'weather', 'objects'].includes(key)) throw new Error(`A decoration has no field ${key}.`);
  if (input.v !== undefined && input.v !== 1) throw new Error('v must be 1.');
  if (!worldChoices.includes(input.kind)) throw new Error(`kind must be one of ${worldChoices.join(', ')}.`);
  if (input.tod !== 'auto' && !timesOfDay.some(step => step.key === input.tod)) throw new Error(`tod must be auto or one of ${timesOfDay.map(step => step.key).join(', ')}.`);
  if (!timeUnlocked(input.tod, facts)) throw new Error(`${input.tod} is not earned yet: it unlocks at ${timesOfDay.find(step => step.key === input.tod).days} days live.`);
  if (!weathers.some(entry => entry.key === input.weather)) throw new Error(`weather must be one of ${weathers.map(entry => entry.key).join(', ')}.`);
  if (!Array.isArray(input.objects) || input.objects.length > worldLimits.objects) throw new Error(`objects must list at most ${worldLimits.objects} things.`);
  const objects = input.objects.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['t', 'x', 'z', 's'].includes(key))) throw new Error(`objects[${index}] must be { t, x, z, s }.`);
    if (!worldObjects.some(entry => entry.type === item.t)) throw new Error(`objects[${index}].t must be one of ${worldObjects.map(entry => entry.type).join(', ')}.`);
    if (!objectUnlocked(item.t, facts)) throw new Error(`objects[${index}]: ${lockedReason(item.t, facts).toLowerCase()}.`);
    if (!inside(item.x, worldLimits.x) || !inside(item.z, worldLimits.z)) throw new Error(`objects[${index}] must stand inside the world: x from ${worldLimits.x[0]} to ${worldLimits.x[1]}, z from ${worldLimits.z[0]} to ${worldLimits.z[1]}.`);
    if (!inside(item.s, [0, 1])) throw new Error(`objects[${index}].s must be a seed from 0 to 1.`);
    return { t: item.t, x: round(item.x, 2), z: round(item.z, 2), s: round(item.s, 3) };
  });
  return { v: 1, kind: input.kind, tod: input.tod, weather: input.weather, objects };
}

/**
 * A stored decoration as the card can show it now: things the card no longer has earned (a mend that reopened) are
 * left out and a time of day it no longer has earned falls back to `auto`. Never throws; an unreadable decoration is null.
 * @param {unknown} stored
 * @param {{ days: number | null, merged: boolean, condition: string | null }} facts
 */
export function shownWorld(stored, facts) {
  if (!stored || typeof stored !== 'object' || !worldChoices.includes(stored.kind)) return null;
  const objects = Array.isArray(stored.objects) ? stored.objects.filter(item => item && objectUnlocked(item.t, facts) && inside(item.x, worldLimits.x) && inside(item.z, worldLimits.z) && inside(item.s, [0, 1])).slice(0, worldLimits.objects) : [];
  const tod = stored.tod === 'auto' || timesOfDay.some(step => step.key === stored.tod) ? (timeUnlocked(stored.tod, facts) ? stored.tod : 'auto') : 'auto';
  const weather = weathers.some(entry => entry.key === stored.weather) ? stored.weather : 'clear';
  return { v: 1, kind: stored.kind, tod, weather, objects: objects.map(({ t, x, z, s }) => ({ t, x, z, s })) };
}

/** The label of a world kind, a time of day or a thing. */
export function worldLabel(key) {
  return worldKinds.find(kind => kind.key === key)?.label ?? timesOfDay.find(step => step.key === key)?.label ?? worldObjects.find(item => item.type === key)?.label ?? weathers.find(entry => entry.key === key)?.label ?? (key === 'off' ? 'Off' : String(key ?? ''));
}
