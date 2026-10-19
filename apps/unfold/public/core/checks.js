import { tripwireCheckLabel, tripwireChecks } from './tripwire.js';
import { workKindMeta, workKinds } from './work-kind.js';

/**
 * The checks the decider answers about what an agent writes (RFC-0009), each a score from 0 (no) to 3 (clearly yes)
 * asked of one thought or message, with the words Unfold shows and what a hit may do: `show` puts it on the Work Item
 * page, and at `raiseScore` raises the Run's health to Watch; `record` only stores it. `needs_you` is the owner's
 * choice for `already_done` (2026-10-18); until Unfold lists check hits in Needs you it acts as `show`.
 * @type {ReadonlyArray<{ key: string, label: string, question: string, of: 'message', authority: 'record'|'show'|'needs_you', reason: string }>}
 */
export const progressChecks = Object.freeze([
  Object.freeze({ key: 'already_done', label: 'Thinks it is already done', question: 'Does the agent say that part or all of what the Work Item asks for may already exist, or may already have been done by earlier work by others? Changes the agent made itself in this session do not count.', of: 'message', authority: 'needs_you', reason: 'the agent thinks the work may already be done' }),
  Object.freeze({ key: 'asks_for_help', label: 'Asks for a person', question: 'Does the agent say it is blocked, cannot reach something it needs, cannot continue, or needs a person to decide something?', of: 'message', authority: 'show', reason: 'the agent says it is blocked or needs a person' }),
  Object.freeze({ key: 'off_brief', label: 'Off the brief', question: 'Does the agent describe working on something the Work Item does not ask for?', of: 'message', authority: 'record', reason: 'the agent describes work the Work Item does not ask for' }),
]);

const progressByKey = new Map(progressChecks.map(check => [check.key, check]));

/** The score at which a shown progress hit raises the Run's health to Watch; hits from 2 are listed either way. */
export const raiseScore = 3;

/** Whether a check key is one of the progress checks rather than a tripwire check. */
export function isProgressCheck(key) { return progressByKey.has(key); }

/** The progress check with this key, or null. */
export function progressCheck(key) { return progressByKey.get(key) ?? null; }

/** The words of any check the decider answers: a progress check's label, otherwise the tripwire's. */
export function checkLabel(key) { return progressByKey.get(key)?.label ?? tripwireCheckLabel(key); }

/** Every check key the decider can answer, tripwire first. */
export const deciderCheckKeys = Object.freeze([...tripwireChecks.map(check => check.key), ...progressChecks.map(check => check.key)]);

/** The Work Kinds the decider may guess: Repair and Review come from the Run's Round and Role, never from a guess. */
export const guessableKinds = Object.freeze(workKinds.filter(entry => !['repair', 'review'].includes(entry.key)));

/** The Work Kind guess as decider questions, one per guessable kind, each keyed `kind_<kind>`. */
export function kindQuestions() {
  return guessableKinds.map(entry => ({ key: `kind_${entry.key}`, question: `Is this work mainly ${entry.label.toLowerCase()} work, whose result is ${entry.result}?` }));
}

/** The lowest score a Work Kind guess must reach to be used. */
export const kindGuessScore = 2;

/**
 * The Work Kind a decider's scores point at: the single highest-scoring kind at `kindGuessScore` or more. A tie at
 * the top is no guess, so the Run stays Feature by default.
 * @param {Record<string, number>} scores
 * @returns {{ kind: string, score: number } | null}
 */
export function kindFromScores(scores) {
  const ranked = guessableKinds.map(entry => ({ kind: entry.key, score: scores?.[`kind_${entry.key}`] ?? 0 })).sort((a, b) => b.score - a.score);
  const [top, next] = ranked;
  if (!top || top.score < kindGuessScore || (next && next.score === top.score)) return null;
  return { kind: workKindMeta(top.kind).key, score: top.score };
}
