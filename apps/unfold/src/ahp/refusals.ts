type Json = Record<string, any>;

/**
 * Where a refused chat action's reason shows in its chat. A turn of its own for a refused message, so the person's message
 * gets a finished reply; the turn still open for a refusal that arrives while one runs, so that turn keeps going.
 */
export type RefusalPlacement = 'ownTurn' | 'openTurn';

const placements: Readonly<Record<string, RefusalPlacement>> = {
  'chat/turnStarted': 'ownTurn',
  'chat/pendingMessageSet': 'openTurn',
  'chat/turnCancelled': 'openTurn',
  'chat/inputCompleted': 'openTurn',
  'chat/toolCallConfirmed': 'openTurn',
};

const openings: Readonly<Record<string, string>> = {
  'chat/turnCancelled': 'Stop',
  'chat/inputCompleted': 'Your answer',
  'chat/toolCallConfirmed': 'Your approval',
};

const clientTurnId = /^[A-Za-z0-9_.:-]{1,128}$/;

/**
 * Where a refusal of this chat action shows, or undefined for an action whose refusal the client shows by itself or that
 * changes nothing a person reads in the chat. VS Code 1.142 drops `rejectionReason` for every chat action but
 * `chat/turnResume`, which it reports as a failed request.
 */
export const refusalPlacement = (actionType: unknown): RefusalPlacement | undefined => placements[String(actionType)];

function refusedMessage(action: Json): Json {
  const text = action.message?.text;
  if (typeof text === 'string' && text.trim()) return { text, origin: { kind: action.message?.origin?.kind === 'systemNotification' ? 'systemNotification' : 'user' } };
  return { text: openings[String(action.type)] ?? 'Your message', origin: { kind: 'systemNotification' } };
}

/**
 * The chat actions that show why the host refused a chat action, sent after the refusal itself: the reason as a Markdown
 * part of the open turn, or a finished turn of its own that carries the person's message (under the turn id they chose,
 * for a refused `chat/turnStarted`) and the reason as its reply.
 */
export function refusalReply(action: Json, reason: string, openTurnId: string | undefined, newId: () => string): Json[] {
  const placement = refusalPlacement(action.type);
  if (!placement) return [];
  const part = (turnId: string) => ({ type: 'chat/responsePart', turnId, part: { kind: 'markdown', id: `${turnId}-refusal-${newId()}`, content: reason } });
  if (placement === 'openTurn' && openTurnId) return [part(openTurnId)];
  const turnId = placement === 'ownTurn' && typeof action.turnId === 'string' && clientTurnId.test(action.turnId) ? action.turnId : `refusal-${newId()}`;
  return [{ type: 'chat/turnStarted', turnId, startedAt: new Date().toISOString(), message: refusedMessage(action) }, part(turnId), { type: 'chat/turnComplete', turnId, duration: 0 }];
}
