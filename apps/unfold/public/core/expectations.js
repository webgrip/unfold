import { workKindMeta, workKindOf, workKinds } from './work-kind.js';

/**
 * What each Work Kind is expected to look like (RFC-0009), until a Team has enough finished Runs to learn its own:
 * `readMinutes`, how long a Run may read (Orient, Explore, Wait, Other) without changing, testing, shipping or setting
 * up; `firstChangeMinutes`, by when it changes a file (null: no change expected); `cycles`, how many change-then-test
 * rounds it needs at most (null: not judged); `verifyBeforeShip`, whether it must test after its last change before
 * it ships; `changes`, whether it may change files at all. Watch at the number, Off track at twice it. Step 0 of
 * RFC-0009 found two well-ended Runs on 2026-10-18, too few to learn from, so these are reviewed defaults.
 */
export const expectationDefaults = Object.freeze(Object.fromEntries(Object.entries({
  feature: [15, 20, 6, true, true],
  fix: [15, 20, 6, true, true],
  refactor: [10, 15, 10, true, true],
  docs: [10, 10, 4, true, true],
  tests: [15, 15, 8, true, true],
  dependency: [8, 8, 4, true, true],
  config: [8, 8, 4, true, true],
  repair: [10, 10, 6, true, true],
  spike: [45, null, null, false, true],
  research: [60, null, null, false, true],
  review: [20, null, null, false, false],
}).map(([kind, [readMinutes, firstChangeMinutes, cycles, verifyBeforeShip, changes]]) => [kind, Object.freeze({ readMinutes, firstChangeMinutes, cycles, verifyBeforeShip, changes })])));

/** The settings a Team may pin per Work Kind, with the type each takes. */
export const expectationSettings = Object.freeze({ readMinutes: 'minutes', firstChangeMinutes: 'minutes', cycles: 'count', verifyBeforeShip: 'boolean' });

/**
 * The expectations for one Work Kind on one Team: the defaults, with any value the Team pinned in configuration
 * (`judgement.teams.<team>.expectations.<kind>`). `source` names which settings were pinned.
 * @param {string} kind A Work Kind key.
 * @param {Record<string, unknown> | null} [pinned] The Team's pinned values for this kind.
 */
export function expectationsFor(kind, pinned = null) {
  const key = workKindMeta(kind).key;
  const base = expectationDefaults[key];
  const own = Object.entries(pinned ?? {}).filter(([setting]) => Object.hasOwn(expectationSettings, setting));
  return { kind: key, ...base, ...Object.fromEntries(own), pinned: own.map(([setting]) => setting) };
}

/** Every Work Kind's key, for configuration checks. */
export const expectationKinds = Object.freeze(workKinds.map(entry => entry.key));

/**
 * What Run health needs to judge one Run against its Work Kind: the kind and why, the Team's expectations for it, and
 * the tally of its calls' Activities.
 * @param {{ title?: string, description?: string }} item
 * @param {{ writes?: boolean, round?: number, role?: string } | null} run
 * @param {object} tally From `activityTally`/`tallyCall`.
 * @param {Record<string, Record<string, unknown>> | null} [pinned] The Team's pinned expectations by Work Kind.
 * @param {{ kind: string|null, score: number } | null} [guess] The decider's Work Kind guess; used only when no rule recognised the work.
 */
export function runWork(item, run, tally, pinned = null, guess = null) {
  const ruled = workKindOf(item, run);
  const meta = guess?.kind && ruled.source === 'default' ? workKindMeta(guess.kind) : null;
  const kind = meta ? { kind: meta.key, family: meta.family, label: meta.label, source: 'decider', rule: `the decider scored the title ${guess.score} of 3 as ${meta.label} work` } : ruled;
  return { ...kind, expectations: expectationsFor(kind.kind, pinned?.[kind.kind] ?? null), tally };
}
