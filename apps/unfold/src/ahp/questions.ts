import type { PermissionRequest, User } from '../types.ts';

type Json = Record<string, any>;
type Choice = { label: string; description?: string };

const yesWords = new Set(['yes', 'y']);
const noWords = new Set(['no', 'n']);
const word = (label: string) => label.trim().replace(/[.!]+$/, '').toLowerCase();

/**
 * The options of a question that offers exactly a yes and a no, labelled "Yes" and "No" in the crew's order, each keeping
 * the id of the crew's own option so the answer maps back to the crew's spelling unchanged. VS Code 1.141 shows AHP's
 * `boolean` kind as True and False, so a yes/no question is a single-select instead. A question with a third option,
 * option descriptions or several answers is not a yes/no question.
 */
export function yesNoOptions(question: Json, choices: readonly Choice[]): Array<{ id: string; label: 'Yes' | 'No' }> | undefined {
  if (question?.multiple === true || choices.length !== 2 || choices.some(choice => choice.description)) return undefined;
  const options = choices.map((choice, index) => ({ id: String(index), label: yesWords.has(word(choice.label)) ? 'Yes' as const : noWords.has(word(choice.label)) ? 'No' as const : undefined }));
  return options.some(option => option.label === 'Yes') && options.some(option => option.label === 'No') ? options as Array<{ id: string; label: 'Yes' | 'No' }> : undefined;
}

/** The events by which the host records that a person declined a crew's question, and that the decline did not reach the crew. */
export const declineEvents = { declined: 'question.declined', withdrawn: 'question.decline_withdrawn' } as const;

/** What the crew receives for every question of a declined request, as its explicit answer. */
export function declinedAnswerText(user: Pick<User, 'name'>): string {
  return `Declined by ${user.name}: no answer will be given. Continue with your best judgement and say what you assumed.`;
}

/** Why a decline is not passed on while the person is stopping the turn: stopping pauses the session and keeps the question open. */
export const stoppingRefusal = 'The turn is being stopped, so this question stays open and is not declined. Answer or decline it after you resume the session.';

/** The decline of one request: the answers the engine passes to the crew, and the skipped answers the chat records. */
export function declinedAnswers(request: PermissionRequest, user: Pick<User, 'name'>): { answers: string[][]; recorded: Json } {
  const text = declinedAnswerText(user);
  const count = Math.max(1, Array.isArray(request.questions) ? request.questions.length : 0);
  const ids = Array.from({ length: count }, (_, index) => String(index));
  return { answers: ids.map(() => [text]), recorded: Object.fromEntries(ids.map(id => [id, { state: 'skipped', freeformValues: [text] }])) };
}

/** The requests a projection has seen declined and not withdrawn, keyed by request id, with the answers the chat records. */
export class Declines {
  private readonly open = new WeakMap<object, Map<string, Json>>();

  private of(projection: object): Map<string, Json> {
    let declines = this.open.get(projection);
    if (!declines) { declines = new Map(); this.open.set(projection, declines); }
    return declines;
  }

  /** Applies a decline event; returns whether the event was one. */
  observe(projection: object, type: string, data: Json): boolean {
    const requestId = String(data?.requestId ?? '');
    if (type === declineEvents.declined) { this.of(projection).set(requestId, data?.answers && typeof data.answers === 'object' ? data.answers : {}); return true; }
    if (type === declineEvents.withdrawn) { this.of(projection).delete(requestId); return true; }
    return false;
  }

  /** The recorded answers of a declined request, removed as the request resolves; undefined when it was not declined. */
  take(projection: object, requestId: string): Json | undefined {
    const declines = this.of(projection);
    const answers = declines.get(requestId);
    declines.delete(requestId);
    return answers;
  }
}
