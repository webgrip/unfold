import { randomUUID } from 'node:crypto';
import type { User } from '../types.ts';
import type { Store } from '../store.ts';
import { PloegError, cancelShiftChanged, type PloegCancellation, type PloegClient, type PloegDecisionResult, type PloegState } from '../ploeg.ts';
import { listReason } from '../../public/core/reasons.js';
import { answerLimit } from '../../public/core/blackboard.js';
import { money } from '../../public/core/format.js';
import type { WorkItemRecord } from './work-items.ts';

type Json = Record<string, any>;

/** The commands a person gives a Work Item from the Agents window, each only after answering the host's question. */
export type WorkItemCommandKind = 'decide' | 'withdraw' | 'requeue' | 'answer';

/** The questions a Work Item's Runs asked a person that are still waiting (Ploeg ADR-0121), and the resume Ploeg offers once they are answered. */
export type WorkItemQuestions = { questions: Array<{ id: string; text: string; role: string; round: number | null }>; resume?: { fromRound: number; roundCapUsd: number; poolUsd: number } };

/**
 * One question the host asked a person about a Work Item, and what came of it. It sits in its own turn of the Work Item's
 * chat, or in the open Round's turn when the person stopped a running Round.
 */
export type WorkItemPrompt = {
  requestId: string; kind: WorkItemCommandKind; userId: string; workItemId: string; team: string; publicId: string;
  turnId: string; ownTurn: boolean; startedAt: string; opening: { text: string; origin: 'user' | 'systemNotification' };
  explanation: string; request: Json; expectedState: PloegState; expectedShiftId?: string; note?: string; raisedPoolUsd?: number; questions?: WorkItemQuestions;
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
  requeueQuestion: (team: string, note: boolean) => `Restart from Round 1${note ? ' with this note' : ''}? This spends from ${team}'s pool.`,
  confirmTryAgain: (id: string) => `Confirm below to restart #${id}. Nothing runs until you do.`,
  withdrawn: 'Ploeg restarts a withdrawn Work Item only when its task is assigned to the team again.',
  poolAboveLimit: 'Raise the Team\'s budget to try again with more.',
  unchanged: 'Nothing changed.',
  noteSaved: 'Saved for the next Round. The running agent won\'t see it until then.',
  questionOpening: (id: string, count: number) => `${count === 1 ? 'A question' : `${count} questions`} for you on #${id}`,
  notAnswered: 'Not answered, so nothing was sent and nothing runs. The question still waits for you and is asked again when you next open this session.',
  answersNeeded: 'Every question needs an answer, so nothing was sent. Answer again.',
  answerTooLong: `An answer is at most ${answerLimit} characters, so nothing was sent. Answer again.`,
  noLongerWaiting: (id: string) => `#${id} no longer waits on that question, so nothing was sent.`,
  cancelShiftChanged,
} as const;

/** A person's message that Ploeg stored as a note for the Work Item's next Round, shown as a finished turn of its chat. */
export type WorkItemNote = { turnId: string; userId: string; workItemId: string; publicId: string; text: string; startedAt: string; reply: string };

/** The Shift a Work Item projection shows open, which a note or a Stop names so Ploeg can refuse it once a newer attempt began. */
export const openShiftOf = (entry: WorkItemRecord): string | undefined => entry.item.latestShift && !entry.item.latestShift.closedAt ? entry.item.latestShift.id : undefined;

/** Whether a message on a Work Item in this state becomes a note for its next Round: work that is running or waits its turn. */
export const takesNotes = (state: PloegState) => state === 'leased' || state === 'queued';

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

function requeueRequest(requestId: string, entry: WorkItemRecord, note: boolean, raisedPoolUsd: number | undefined): Json {
  const question = workItemCommandText.requeueQuestion(entry.item.team, note);
  const options = [{ id: 'restart', label: 'Restart from Round 1' }, ...(raisedPoolUsd !== undefined ? [{ id: 'restart_raised', label: `Restart with a ${money(raisedPoolUsd)} pool` }] : []), { id: 'keep', label: 'Leave it stopped' }];
  return { id: requestId, message: question, questions: [{ id: '0', title: `Restart #${entry.item.id}?`, message: question, kind: 'single-select', required: true, options, allowFreeformInput: false }] };
}

const askedBy = (question: WorkItemQuestions['questions'][number]) => `${question.role ? `${question.role[0].toUpperCase()}${question.role.slice(1).replace(/[_-]+/g, ' ')}` : 'An agent'} asks${question.round ? ` in Round ${question.round}` : ''}`;

function answerRequest(requestId: string, entry: WorkItemRecord, asked: WorkItemQuestions): Json {
  const count = asked.questions.length;
  const send = asked.resume ? `Answer and resume Round ${asked.resume.fromRound}` : 'Answer and start it over';
  return {
    id: requestId, message: workItemCommandText.questionOpening(entry.item.id, count),
    questions: [
      ...asked.questions.map((question, index) => ({ id: String(index), title: askedBy(question), message: question.text, kind: 'text', required: true })),
      { id: String(count), title: 'Then', message: `${asked.resume ? 'Resuming' : 'Starting over'} spends from ${entry.item.team}'s budget. Saving only runs nothing.`, kind: 'single-select', required: true, options: [{ id: 'send', label: send }, { id: 'save', label: 'Only save my answers' }], allowFreeformInput: false },
    ],
  };
}

function answerExplanation(entry: WorkItemRecord, asked: WorkItemQuestions): string {
  const count = asked.questions.length;
  const lead = count === 1 ? 'An agent asked a question only a person can answer, instead of guessing.' : `Agents asked ${count} questions only a person can answer, instead of guessing.`;
  const then = asked.resume
    ? `Answer and resume reopens Round ${asked.resume.fromRound} on the same branch: this Round up to ${money(asked.resume.roundCapUsd)}, in total up to ${money(asked.resume.poolUsd)}, from ${entry.item.team}'s budget.`
    : `Answer and start it over restarts it from Round 1, spending from ${entry.item.team}'s budget, and its Runs read your answers.`;
  return `${lead} ${then} Only save my answers sends them to Ploeg and runs nothing. Closing the question sends nothing.`;
}

const budgetRanOut = (entry: WorkItemRecord) => ['budget_exhausted', 'budget_exhausted_before_fix_round'].includes(String(listReason(entry.item)?.code ?? ''));

/** Whether Ploeg would restart a Work Item in this state: one that stopped and needs a person or went stale. */
export const restartable = (state: PloegState) => state === 'needs_human' || state === 'stale';

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

/** The finished turn a saved note shows as. */
export function noteTurn(note: WorkItemNote): Json {
  return { id: note.turnId, startedAt: note.startedAt, message: { text: note.text, origin: { kind: 'user' } }, responseParts: [{ kind: 'markdown', id: `${note.turnId}-reply`, content: note.reply }], duration: 0, state: 'complete' };
}

/** A Work Item chat with the person's prompts in it: each in its own turn, or inside the Round turn it was asked in; and each note they left, in its own finished turn. */
export function withPrompts(chat: Json, prompts: readonly WorkItemPrompt[], notes: readonly WorkItemNote[] = []): Json {
  const turns: Json[] = [...chat.turns.map((turn: Json) => ({ ...turn, responseParts: [...turn.responseParts] })), ...notes.map(noteTurn)];
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
 * The commands a person gives Ploeg Work Items from the Agents window (ADR 0023): approve or reject a proposal, a
 * confirmed Stop that withdraws the Work Item, and a confirmed restart from Round 1 (Ploeg ADR-0044) with an optional note. Every command waits for the person's answer to the host's question, runs as
 * that person, and records its command id before Ploeg is called, so a retry reuses it.
 */
export class WorkItemCommands {
  private readonly store: Store;
  private readonly ploeg: PloegClient;
  private readonly maxPoolUsd: number;
  private readonly asked = new Map<string, WorkItemPrompt[]>();
  private readonly noted = new Map<string, WorkItemNote[]>();

  /** `maxPoolUsd` is the most a restart offers when a Shift's budget ran out; Ploeg refuses a pool above its consumer's own limit. */
  constructor(store: Store, ploeg: PloegClient, maxPoolUsd: number) { this.store = store; this.ploeg = ploeg; this.maxPoolUsd = maxPoolUsd; }

  /** Whether this person may command a team's Work Items: an operator or administrator whom Ploeg's team authorization lets see them. */
  mayAct(user: User, team: string): boolean { return (user.role === 'operator' || user.role === 'admin') && this.ploeg.allows(user, team); }

  /** The person's prompts on one Work Item, oldest first. */
  prompts(userId: string, workItemId: string): WorkItemPrompt[] { return this.asked.get(`${userId}:${workItemId}`) ?? []; }

  /** The notes the person left on one Work Item, oldest first. */
  notes(userId: string, workItemId: string): WorkItemNote[] { return this.noted.get(`${userId}:${workItemId}`) ?? []; }

  /**
   * Stores a person's message as a Ploeg note for the Work Item's next Round, naming the Shift their projection showed
   * open, and returns the finished turn it shows as. The running Run never sees it. Ploeg's refusal propagates as a
   * `PloegError` with a plain sentence.
   */
  async note(user: User, entry: WorkItemRecord, text: string, turnId: string, expectedShiftId: string | undefined): Promise<WorkItemNote> {
    const body = { text, ...(expectedShiftId !== undefined ? { expectedShiftId } : {}) };
    await this.command(user, entry.workItemId, 'note', body, commandId => this.ploeg.note(user, entry.workItemId, { commandId, ...body }));
    const note: WorkItemNote = { turnId, userId: user.id, workItemId: entry.workItemId, publicId: entry.publicId, text, startedAt: new Date().toISOString(), reply: workItemCommandText.noteSaved };
    this.noted.set(`${user.id}:${entry.workItemId}`, [...this.notes(user.id, entry.workItemId), note].slice(-keepOpen));
    return note;
  }

  /** The question still waiting for the person's answer on one Work Item. */
  open(userId: string, workItemId: string): WorkItemPrompt | undefined { return this.prompts(userId, workItemId).find(prompt => !prompt.response); }

  find(userId: string, workItemId: string, requestId: string): WorkItemPrompt | undefined { return this.prompts(userId, workItemId).find(prompt => prompt.requestId === requestId); }

  /**
   * Asks the person a question about a Work Item, in the turn it names to join, in a turn of its own with the id it names,
   * or in a new turn. A question of the same kind still open is asked only once unless a new note replaces it; any other
   * open question is closed as replaced, and returned so the host can say so. A restart carries the person's note and, when
   * the last Shift's budget ran out, offers a raised pool.
   */
  ask(user: User, entry: WorkItemRecord, kind: WorkItemCommandKind, placement: { attachTo?: string; ownTurnId?: string; opening?: WorkItemPrompt['opening']; expectedShiftId?: string } = {}, note?: string, asked?: WorkItemQuestions): { prompt: WorkItemPrompt; created: boolean; replaced?: WorkItemPrompt } {
    if (kind === 'answer' && !asked?.questions.length) throw new Error('An answer prompt needs the questions it asks');
    const current = this.open(user.id, entry.workItemId);
    if (current?.kind === kind && note === undefined) return { prompt: current, created: false };
    const replaced = current ? this.close(current, 'cancel', undefined, 'Replaced by your next action.') : undefined;
    const requestId = `${entry.publicId}-${kind}-${randomUUID()}`;
    const ownTurn = !placement.attachTo;
    const openings: Record<WorkItemCommandKind, string> = { decide: workItemCommandText.decideQuestion(entry.item.id), withdraw: `Stop #${entry.item.id}`, requeue: `Try #${entry.item.id} again`, answer: workItemCommandText.questionOpening(entry.item.id, asked?.questions.length ?? 0) };
    const opening = placement.opening ?? { text: openings[kind], origin: 'systemNotification' as const };
    const previousPool = entry.item.latestShift?.budgetUsd ?? 0;
    const raisedPoolUsd = kind === 'requeue' && budgetRanOut(entry) && this.maxPoolUsd > previousPool ? this.maxPoolUsd : undefined;
    const explanations: Record<WorkItemCommandKind, () => string> = {
      decide: () => `${entry.item.title} waits for approval before Ploeg queues it for ${entry.item.team}.`,
      withdraw: () => workItemCommandText.withdrawQuestion(entry.item.id),
      requeue: () => `${workItemCommandText.requeueQuestion(entry.item.team, Boolean(note))} Ploeg opens a new attempt and tells its Runs why the last one stopped${note ? ' and what you wrote' : ''}.${raisedPoolUsd !== undefined ? ` The last attempt's ${money(previousPool)} budget ran out, so you can restart with up to ${money(raisedPoolUsd)}.` : ''}`,
      answer: () => answerExplanation(entry, asked!),
    };
    const requests: Record<WorkItemCommandKind, () => Json> = { decide: () => decideRequest(requestId, entry), withdraw: () => withdrawRequest(requestId, entry), requeue: () => requeueRequest(requestId, entry, Boolean(note), raisedPoolUsd), answer: () => answerRequest(requestId, entry, asked!) };
    const prompt: WorkItemPrompt = {
      requestId, kind, userId: user.id, workItemId: entry.workItemId, team: entry.item.team, publicId: entry.publicId,
      turnId: placement.attachTo ?? placement.ownTurnId ?? `${entry.publicId}-command-${randomUUID()}`, ownTurn, startedAt: new Date().toISOString(), opening, explanation: explanations[kind](),
      request: requests[kind](), expectedState: entry.item.state, ...(placement.expectedShiftId !== undefined ? { expectedShiftId: placement.expectedShiftId } : {}), ...(note ? { note } : {}), ...(raisedPoolUsd !== undefined ? { raisedPoolUsd } : {}), ...(kind === 'answer' ? { questions: asked } : {}),
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
    if (prompt.response !== 'accept') return finish(prompt.kind === 'answer' ? workItemCommandText.notAnswered : workItemCommandText.unchanged);
    if (!this.mayAct(user, prompt.team)) return finish(workItemCommandText.viewer(prompt.team));
    try {
      if (prompt.kind === 'withdraw') {
        if (selected(prompt.answers, '0') !== 'withdraw') return finish(workItemCommandText.unchanged);
        const guard = prompt.expectedShiftId !== undefined ? { expectedShiftId: prompt.expectedShiftId } : {};
        const result = await this.command(user, prompt.workItemId, 'cancel', guard, commandId => this.ploeg.decide(user, prompt.workItemId, 'cancel', '', { commandId, ...guard })) as PloegCancellation;
        return finish(cancellationReply(prompt.workItemId, result), true);
      }
      if (prompt.kind === 'answer') return finish(...await this.answer(user, prompt));
      if (prompt.kind === 'requeue') {
        const choice = selected(prompt.answers, '0');
        if (choice !== 'restart' && choice !== 'restart_raised') return finish(workItemCommandText.unchanged);
        const body = { expectedState: prompt.expectedState, ...(prompt.note ? { note: prompt.note } : {}), ...(choice === 'restart_raised' && prompt.raisedPoolUsd !== undefined ? { poolUsd: prompt.raisedPoolUsd } : {}) };
        const result = await this.command(user, prompt.workItemId, 'requeue', body, commandId => this.ploeg.requeue(user, prompt.workItemId, { commandId, ...body }));
        return finish(`Restarted #${prompt.workItemId} from Round ${result.fromRound}${result.poolUsd !== null ? ` with a ${money(result.poolUsd)} pool` : ''}.`, true);
      }
      const choice = selected(prompt.answers, '0');
      if (choice !== 'approve' && choice !== 'reject') return finish(workItemCommandText.unchanged);
      const reason = typed(prompt.answers, '1');
      if (choice === 'reject' && !reason) return finish(workItemCommandText.rejectNeedsReason, false, true);
      const result = await this.command(user, prompt.workItemId, choice, choice === 'reject' ? { reason } : {}, () => this.ploeg.decide(user, prompt.workItemId, choice, reason)) as PloegDecisionResult;
      return finish(choice === 'approve' ? `Approved. #${prompt.workItemId} is ${result.state === 'queued' ? `queued for ${result.team}` : result.state.replaceAll('_', ' ')}.` : `Rejected #${prompt.workItemId}: ${reason}`, true);
    } catch (error) {
      if (!(error instanceof PloegError)) throw error;
      if (error.code === 'pool_above_limit') return finish(workItemCommandText.poolAboveLimit);
      return finish(error.code === 'ploeg_decision_conflict' && prompt.kind === 'decide' ? workItemCommandText.noLongerProposed(prompt.workItemId) : error.message);
    }
  }

  /**
   * Sends the person's answers to Ploeg as that person, one per question, and then, when they chose to, resumes the Round
   * that asked as Ploeg offers it or starts the Work Item over. A question someone else answered first keeps their answer.
   */
  private async answer(user: User, prompt: WorkItemPrompt): Promise<[string, boolean, boolean]> {
    const asked = prompt.questions!;
    const count = asked.questions.length;
    const choice = selected(prompt.answers, String(count));
    if (choice !== 'send' && choice !== 'save') return [workItemCommandText.notAnswered, false, false];
    const texts = asked.questions.map((_, index) => typed(prompt.answers, String(index)));
    if (texts.some(text => !text)) return [workItemCommandText.answersNeeded, false, true];
    if (texts.some(text => text.length > answerLimit)) return [workItemCommandText.answerTooLong, false, true];
    let before = 0;
    for (const [index, question] of asked.questions.entries()) {
      const body = { questionId: question.id, answer: texts[index] };
      try { await this.command(user, prompt.workItemId, 'answer', body, commandId => this.ploeg.answerQuestion(user, prompt.workItemId, question.id, { commandId, answer: texts[index] })); }
      catch (error) { if (error instanceof PloegError && error.code === 'already_answered') { before++; continue; } throw error; }
    }
    const others = before ? ` Someone had already answered ${before === count ? (count === 1 ? 'it' : 'them') : `${before} of them`}, so Ploeg kept their answer${before === 1 ? '' : 's'}.` : '';
    const saved = `${count === 1 ? 'Your answer is' : 'Your answers are'} saved for #${prompt.workItemId}'s next Runs.${others}`;
    if (choice === 'save') return [`${saved} Nothing runs until you restart it.`, true, false];
    const body = { expectedState: prompt.expectedState, ...(asked.resume ? { resume: true } : {}) };
    const result = await this.command(user, prompt.workItemId, 'requeue', body, commandId => this.ploeg.requeue(user, prompt.workItemId, { commandId, ...body }));
    return [`${saved} ${result.resumed ? 'Resumed' : 'Restarted'} #${prompt.workItemId} from Round ${result.fromRound}.`, true, false];
  }

  /** Records the command before Ploeg is called and forgets it once Ploeg answered for good, a refusal or a route it lacks included; after an outage the same command, retried, keeps its id. */
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
      if (error instanceof PloegError && ((error.status >= 400 && error.status < 500) || error.status === 501)) this.store.deleteSecret(key);
      throw error;
    }
  }
}
