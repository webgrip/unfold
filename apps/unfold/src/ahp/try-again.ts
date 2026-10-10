import type { Session } from '../types.ts';
import { money } from '../../public/core/format.js';

type Json = Record<string, any>;

/** The event by which the host records that a person pressed Try Again on a failed turn, and the session it created. */
export const turnResumedEvent = 'chat.turn_resumed';

/**
 * Whether a failed session's error part offers VS Code's Try Again: only a failure the Run-again path accepts, so a
 * session imported from a tracker, which is run again from its tracker, never offers it.
 */
export function resumable(session: Pick<Session, 'status' | 'sourceTask'>): boolean {
  return session.status === 'failed' && !session.sourceTask;
}

/** Why `chat/turnResume` cannot act on this turn, in the words the person reads; undefined when it can. */
export function resumeRefusal(session: Pick<Session, 'status' | 'sourceTask'>, turns: readonly Json[], activeTurn: Json | undefined, turnId: unknown, viewer: boolean): string | undefined {
  if (viewer) return 'Viewers cannot change work';
  if (activeTurn) return 'A turn is still running; Try Again applies only to the last failed turn';
  const last = turns.at(-1);
  if (!last || last.id !== turnId || last.state !== 'error') return 'Try Again applies only to the last turn, and only when it failed';
  const part = last.responseParts?.at(-1);
  if (part?.kind !== 'error' || part.resumable !== true) return 'This failure cannot be tried again from here';
  if (!resumable(session)) return session.sourceTask ? 'Import the task again from its tracker to run it again' : 'Only a failed session can be tried again';
  return undefined;
}

/**
 * What a chat says after the Run-again path created a new session, whether Try Again or a "Run again" choice asked for
 * it: what the session carries over, where it is, and whether it started.
 */
export function runAgainReply(next: Pick<Session, 'title' | 'budgetUsd'>, page: string, outcome: { started?: boolean; withMessage?: boolean; startError?: string } = {}): string {
  const created = `Created a new session, **${next.title}**, with this session's brief, repository, crew, placement and budget (${money(next.budgetUsd)})${outcome.withMessage ? ', and your message as an instruction its crew reads' : ''}. It is in the Agents window's session list${page ? ` and on [its session page](${page})` : ''}. This session stays as it is.`;
  if (outcome.startError) return `${created}\n\nStarting it did not work: ${outcome.startError} It waits for you to start it.`;
  return outcome.started ? `${created}\n\nIt started as a new Ploeg authorization.` : `${created}\n\nIt waits for you: send it a message to start it, or start it on its session page.`;
}
