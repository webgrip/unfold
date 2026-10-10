import { randomUUID } from 'node:crypto';
import type { User } from '../types.ts';
import type { Store } from '../store.ts';
import { PloegError, type PloegCancellation, type PloegClient, type PloegDecisionResult } from '../ploeg.ts';
import type { WorkItemRecord } from './work-items.ts';

type Json = Record<string, any>;

/** The commands a person gives a Work Item from the Agents window, each only after answering the host's question. */
export type WorkItemCommandKind = 'decide' | 'withdraw';

/**
 * One question the host asked a person about a Work Item, and what came of it. It sits in its own turn of the Work Item's
 * chat, or in the open Round's turn when the person stopped a running Round.
 */
export type WorkItemPrompt = {
  requestId: string; kind: WorkItemCommandKind; userId: string; workItemId: string; team: string; publicId: string;
  turnId: string; ownTurn: boolean; startedAt: string; opening: { text: string; origin: 'user' | 'systemNotification' };
  explanation: string; request: Json;
  response?: 'accept' | 'cancel'; answers?: Json; reply?: string; finishedAt?: string; turnState?: 'complete' | 'cancelled';
};

/** What the host says while a person steers a Work Item. ADR 0023: steering reaches the next Round, not the running Run, and archiving is not cancelling. */
export const workItemCommandText = {
  viewer: (team: string) => `Only an operator or administrator of ${team} can act on its Work Items. You can follow this one.`,
  withdrawQuestion: (id: string) => `Withdraw #${id}? This stops the running Run, blocks its keys and comments on the tracker. It can't be resumed.`,
  confirmStop: (id: string) => `Confirm below to withdraw #${id}. Nothing stops until you do.`,
  ended: (id: string) => `#${id} already ended, so there is nothing to stop.`,
  decideQuestion: (id: string) => `Approve #${id}?`,
  rejectNeedsReason: 'A rejection needs a reason, so nothing changed. Answer again and say why you reject it.',
  noLongerProposed: (id: string) => `#${id} no longer waits for approval, so nothing changed.`,
  unchanged: 'Nothing changed.',
} as const;

const keepOpen = 20;

function selected(answers: Json | undefined, question: string): string | undefined {
  const value = answers?.[question]?.value;
  return value?.kind === 'selected' && typeof value.value === 'string' ? value.value : undefined;
}
function typed(answers: Json | undefined, question: string): string {
  const value = answers?.[question]?.value;
  return value?.kind === 'text' && typeof value.value === 'string' ? value.value.trim() : '';
}

function decideRequest(requestId: string, entry: WorkItemRecord): Json {
  return {
    id: requestId, message: workItemCommandText.decideQuestion(entry.item.id),
    questions: [
      { id: '0', title: workItemCommandText.decideQuestion(entry.item.id), message: `Approve queues it for ${entry.item.team}. Reject withdraws the proposal and records your reason.`, kind: 'single-select', required: true, options: [{ id: 'approve', label: 'Approve' }, { id: 'reject', label: 'Reject' }], allowFreeformInput: false },
      { id: '1', title: 'Reason', message: 'Why you reject it. A rejection needs one.', kind: 'text', required: false },
    ],
  };
}

function withdrawRequest(requestId: string, entry: WorkItemRecord): Json {
  const question = workItemCommandText.withdrawQuestion(entry.item.id);
  return { id: requestId, message: question, questions: [{ id: '0', title: `Withdraw #${entry.item.id}?`, message: question, kind: 'single-select', required: true, options: [{ id: 'withdraw', label: `Withdraw #${entry.item.id}` }, { id: 'keep', label: 'Keep it running' }], allowFreeformInput: false }] };
}

function cancellationReply(id: string, result: PloegCancellation): string {
  if (result.demo) return result.message;
  if (result.withdrawn === false) return `#${id} was already withdrawn, so nothing more stopped.`;
  const runs = (result.stoppedRuns ?? 0) + (result.cancelledRuns ?? 0);
  return `Withdrew #${id}. Ploeg stopped ${runs} Run${runs === 1 ? '' : 's'}${result.keysBlocked ? ' and blocked their keys' : ''}, and tells the tracker it was cancelled.`;
}

/** The parts a prompt adds to its turn: why the host asks, the question, and once answered what came of it. */
export function promptParts(prompt: WorkItemPrompt): Json[] {
  const request = prompt.answers ? { ...prompt.request, answers: prompt.answers } : prompt.request;
  return [
    { kind: 'markdown', id: `${prompt.requestId}-explanation`, content: prompt.explanation },
    { kind: 'inputRequest', request, ...(prompt.response ? { response: prompt.response } : {}) },
    ...(prompt.reply ? [{ kind: 'markdown', id: `${prompt.requestId}-reply`, content: prompt.reply }] : []),
  ];
}

const duration = (prompt: WorkItemPrompt) => Math.max(0, Date.parse(prompt.finishedAt ?? prompt.startedAt) - Date.parse(prompt.startedAt)) || 0;

function promptTurn(prompt: WorkItemPrompt): Json {
  const turn = { id: prompt.turnId, startedAt: prompt.startedAt, message: { text: prompt.opening.text, origin: { kind: prompt.opening.origin } }, responseParts: promptParts(prompt) };
  return prompt.finishedAt ? { ...turn, duration: duration(prompt), state: prompt.turnState ?? 'complete' } : turn;
}

/** A Work Item chat with the person's prompts in it: each in its own turn, or inside the Round turn it was asked in. */
export function withPrompts(chat: Json, prompts: readonly WorkItemPrompt[]): Json {
  const turns: Json[] = chat.turns.map((turn: Json) => ({ ...turn, responseParts: [...turn.responseParts] }));
  let activeTurn: Json | undefined = chat.activeTurn ? { ...chat.activeTurn, responseParts: [...chat.activeTurn.responseParts] } : undefined;
  for (const prompt of prompts) {
    const host = [...turns, ...(activeTurn ? [activeTurn] : [])].find(turn => turn.id === prompt.turnId);
    if (host && !prompt.ownTurn) { host.responseParts.push(...promptParts(prompt)); continue; }
    const turn = promptTurn(prompt);
    if (!prompt.finishedAt && !activeTurn) activeTurn = turn; else turns.push(turn.state ? turn : { ...turn, duration: 0, state: 'complete' });
  }
  return { ...chat, turns, ...(activeTurn ? { activeTurn } : {}) };
}

/** A prompt as the session's `inputNeeded` entry. */
export const promptInputNeeded = (prompt: WorkItemPrompt, chat: string): Json => ({ id: prompt.requestId, chat, kind: 'chatInput', request: prompt.request });

/** The chat actions that open a prompt: its own turn unless it joins the open Round's, why the host asks, and the question. */
export function promptOpenActions(prompt: WorkItemPrompt, turnOpened = false): Json[] {
  const [explanation] = promptParts(prompt);
  return [
    ...(prompt.ownTurn && !turnOpened ? [{ type: 'chat/turnStarted', turnId: prompt.turnId, startedAt: prompt.startedAt, message: { text: prompt.opening.text, origin: { kind: prompt.opening.origin } } }] : []),
    { type: 'chat/responsePart', turnId: prompt.turnId, part: explanation },
    { type: 'chat/inputRequested', request: prompt.request },
  ];
}

/** The chat actions after a prompt's answer: what came of it, and the end of its own turn. */
export function promptClosedActions(prompt: WorkItemPrompt): Json[] {
  return [
    ...(prompt.reply ? [{ type: 'chat/responsePart', turnId: prompt.turnId, part: { kind: 'markdown', id: `${prompt.requestId}-reply`, content: prompt.reply } }] : []),
    ...(prompt.ownTurn && prompt.turnState !== 'cancelled' ? [{ type: 'chat/turnComplete', turnId: prompt.turnId, duration: duration(prompt) }] : []),
  ];
}

type PendingCommand = { commandId: string; action: string; workItemId: string; actingUser: string; body: Json; createdAt: string };

/**
 * The commands a person gives Ploeg Work Items from the Agents window (ADR 0023): approve or reject a proposal, and a
 * confirmed Stop that withdraws the Work Item. Every command waits for the person's answer to the host's question, runs as
 * that person, and records its command id before Ploeg is called, so a retry reuses it.
 */
export class WorkItemCommands {
  private readonly store: Store;
  private readonly ploeg: PloegClient;
  private readonly asked = new Map<string, WorkItemPrompt[]>();

  constructor(store: Store, ploeg: PloegClient) { this.store = store; this.ploeg = ploeg; }

  /** Whether this person may command a team's Work Items: an operator or administrator whom Ploeg's team authorization lets see them. */
  mayAct(user: User, team: string): boolean { return (user.role === 'operator' || user.role === 'admin') && this.ploeg.allows(user, team); }

  /** The person's prompts on one Work Item, oldest first. */
  prompts(userId: string, workItemId: string): WorkItemPrompt[] { return this.asked.get(`${userId}:${workItemId}`) ?? []; }

  /** The question still waiting for the person's answer on one Work Item. */
  open(userId: string, workItemId: string): WorkItemPrompt | undefined { return this.prompts(userId, workItemId).find(prompt => !prompt.response); }

  find(userId: string, workItemId: string, requestId: string): WorkItemPrompt | undefined { return this.prompts(userId, workItemId).find(prompt => prompt.requestId === requestId); }

  /**
   * Asks the person a question about a Work Item. A question of the same kind still open is asked only once; one of another
   * kind is closed as replaced, and returned so the host can say so.
   */
  ask(user: User, entry: WorkItemRecord, kind: WorkItemCommandKind, placement: { turnId?: string; opening?: WorkItemPrompt['opening'] } = {}): { prompt: WorkItemPrompt; created: boolean; replaced?: WorkItemPrompt } {
    const current = this.open(user.id, entry.workItemId);
    if (current?.kind === kind) return { prompt: current, created: false };
    const replaced = current ? this.close(current, 'cancel', undefined, 'Replaced by your next action.') : undefined;
    const requestId = `${entry.publicId}-${kind}-${randomUUID()}`;
    const ownTurn = !placement.turnId;
    const opening = placement.opening ?? { text: kind === 'decide' ? workItemCommandText.decideQuestion(entry.item.id) : `Stop #${entry.item.id}`, origin: 'systemNotification' as const };
    const explanation = kind === 'decide' ? `${entry.item.title} waits for approval before Ploeg queues it for ${entry.item.team}.` : workItemCommandText.withdrawQuestion(entry.item.id);
    const prompt: WorkItemPrompt = {
      requestId, kind, userId: user.id, workItemId: entry.workItemId, team: entry.item.team, publicId: entry.publicId,
      turnId: placement.turnId ?? `${entry.publicId}-command-${randomUUID()}`, ownTurn, startedAt: new Date().toISOString(), opening, explanation,
      request: kind === 'decide' ? decideRequest(requestId, entry) : withdrawRequest(requestId, entry),
    };
    const key = `${user.id}:${entry.workItemId}`;
    this.asked.set(key, [...this.prompts(user.id, entry.workItemId), prompt].slice(-keepOpen));
    return { prompt, created: true, ...(replaced ? { replaced } : {}) };
  }

  /** Closes a prompt without calling Ploeg, with what the host says about it. */
  close(prompt: WorkItemPrompt, response: 'accept' | 'cancel', answers: Json | undefined, reply: string, turnState: WorkItemPrompt['turnState'] = 'complete'): WorkItemPrompt {
    Object.assign(prompt, { response, reply, finishedAt: new Date().toISOString(), turnState, ...(answers ? { answers } : {}) });
    return prompt;
  }

  /** Marks a prompt answered before its command runs, so a second answer finds nothing to answer. */
  claim(prompt: WorkItemPrompt, response: 'accept' | 'cancel', answers: Json | undefined): void { Object.assign(prompt, { response, ...(answers ? { answers } : {}) }); }

  /**
   * Carries out a claimed prompt's answer as the person: nothing unless they accepted the command, otherwise the Ploeg call.
   * Returns the reply, whether Ploeg changed the Work Item, and whether the question must be asked again.
   */
  async carry(user: User, prompt: WorkItemPrompt): Promise<{ changed: boolean; askAgain: boolean }> {
    const finish = (reply: string, changed = false, askAgain = false) => { this.close(prompt, prompt.response ?? 'cancel', prompt.answers, reply); return { changed, askAgain }; };
    if (prompt.response !== 'accept') return finish(workItemCommandText.unchanged);
    if (!this.mayAct(user, prompt.team)) return finish(workItemCommandText.viewer(prompt.team));
    try {
      if (prompt.kind === 'withdraw') {
        if (selected(prompt.answers, '0') !== 'withdraw') return finish(workItemCommandText.unchanged);
        const result = await this.command(user, prompt.workItemId, 'cancel', {}, () => this.ploeg.decide(user, prompt.workItemId, 'cancel')) as PloegCancellation;
        return finish(cancellationReply(prompt.workItemId, result), true);
      }
      const choice = selected(prompt.answers, '0');
      if (choice !== 'approve' && choice !== 'reject') return finish(workItemCommandText.unchanged);
      const reason = typed(prompt.answers, '1');
      if (choice === 'reject' && !reason) return finish(workItemCommandText.rejectNeedsReason, false, true);
      const result = await this.command(user, prompt.workItemId, choice, choice === 'reject' ? { reason } : {}, () => this.ploeg.decide(user, prompt.workItemId, choice, reason)) as PloegDecisionResult;
      return finish(choice === 'approve' ? `Approved. #${prompt.workItemId} is ${result.state === 'queued' ? `queued for ${result.team}` : result.state.replaceAll('_', ' ')}.` : `Rejected #${prompt.workItemId}: ${reason}`, true);
    } catch (error) {
      if (!(error instanceof PloegError)) throw error;
      return finish(error.code === 'ploeg_decision_conflict' && prompt.kind === 'decide' ? workItemCommandText.noLongerProposed(prompt.workItemId) : error.message);
    }
  }

  /** Records the command before Ploeg is called and forgets it once Ploeg answered for good; after an outage the same command, retried, keeps its id. */
  private async command<T>(user: User, workItemId: string, action: string, body: Json, call: (commandId: string) => Promise<T>): Promise<T> {
    const key = `work-item-command:${user.id}:${workItemId}`;
    const pending = this.store.getSecret<PendingCommand>(key);
    const command = pending && pending.action === action && JSON.stringify(pending.body) === JSON.stringify(body) ? pending : { commandId: randomUUID(), action, workItemId, actingUser: user.id, body, createdAt: new Date().toISOString() };
    this.store.setSecret(key, command);
    try {
      const result = await call(command.commandId);
      this.store.deleteSecret(key);
      return result;
    } catch (error) {
      if (error instanceof PloegError && error.status >= 400 && error.status < 500) this.store.deleteSecret(key);
      throw error;
    }
  }
}
