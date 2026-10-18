import type { User } from '../types.ts';

type Json = Record<string, any>;

/** The allowance a chat last saw for its Team, as the chat shows it: what is left, the limit and when the period resets. */
export type ChatAllowanceView = { remainingUsd: number; limitUsd: number; resetAt: string };

/** One conversation with Unfold in the Agents window, owned by one person and paid from one Team's chat allowance (Unfold ADR 0049, proposed). */
export type ChatRecord = {
  id: string;
  owner: Pick<User, 'id' | 'name' | 'role'>;
  title: string;
  team: string;
  createdAt: string;
  updatedAt: string;
  allowance: ChatAllowanceView | null;
};

/** Where a chat turn is: still being answered, answered, stopped by the person, or ended with an error. */
export type ChatTurnState = 'active' | 'complete' | 'cancelled' | 'error';

/**
 * One person message and what came of it, kept as the Agent Host Protocol response parts the chat showed: Markdown,
 * tool calls with their confirmation and result, and an error. `admission` names the Ploeg chat record that paid for it,
 * so a turn a restart interrupted can still be finished in Ploeg.
 */
export type ChatTurn = {
  chatId: string;
  id: string;
  seq: number;
  startedAt: string;
  finishedAt: string | null;
  text: string;
  responseParts: Json[];
  state: ChatTurnState;
  admission: { team: string; chatId: string } | null;
};
