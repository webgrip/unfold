import type { Core, WaitingQuestionShape } from './core.js';
import type { PloegDetail, PloegNowItem } from './ploeg-types.js';

const pullRequestNumber = (url: string | undefined) => /\/(?:pulls?|merge_requests)\/(\d+)\/?$/.exec(url ?? '')?.[1];

/** Where a hand-off came from, as `GET /api/handoffs` names it: a tracker task handed to a Team, or a Linked Session handed to Ploeg. */
export type HandOffOrigin = { kind: 'task'; sourceId: string; sourceName: string; taskId: string } | { kind: 'session' };

/** One hand-off the person made through any client, with the Work Item it became once Ploeg lists one. */
export type HandOff = { id: number; at: string; channel: string; team: string | null; origin: HandOffOrigin; workItem: PloegNowItem | null; note: string };

/** What `GET /api/handoffs` answers. */
export type HandOffList = { handoffs: HandOff[]; demo: boolean; fetchedAt: string };

const settled = new Set(['done', 'withdrawn']);

/** Whether a hand-off is still in flight: Ploeg has not listed its Work Item yet, or that Work Item is neither done nor withdrawn. */
export function inFlight(handoff: Pick<HandOff, 'workItem'>): boolean {
  return !handoff.workItem || !settled.has(handoff.workItem.state);
}

/** The words a client uses for a channel an Action Record names: the browser, VS Code, or the AI client behind `unfold-mcp`. */
export function channelName(channel: string): string {
  const client = /\(([^)]+)\)$/.exec(channel)?.[1] ?? (channel.startsWith('mcp:') ? channel.slice(4) : '');
  if (channel === 'browser' || channel.startsWith('browser (')) return 'the browser';
  if (channel.startsWith('VS Code')) return 'VS Code';
  if (client && client !== 'unnamed client') return client.replace(/\s+\d[\w.+-]*$/, '');
  return channel.startsWith('unfold-mcp') || channel.startsWith('mcp:') ? 'an AI client' : channel;
}

/** The title of a hand-off: its Work Item's title, else the task it handed over. Tracker and agent text, shown as plain text only. */
export function handOffTitle(handoff: HandOff): string {
  if (handoff.workItem) return handoff.workItem.title || `Work Item ${handoff.workItem.id}`;
  return handoff.origin.kind === 'task' ? `Task ${handoff.origin.taskId} on ${handoff.origin.sourceName}` : 'A session handed to Ploeg';
}

/** The words of one hand-off row: its title, the line beside it, the tooltip lines and what a screen reader says. */
export function describeHandOff(core: Core, handoff: HandOff, demo: boolean, now = Date.now()): { label: string; description: string; heading: string; lines: string[]; accessible: string } {
  const label = handOffTitle(handoff);
  const item = handoff.workItem;
  const when = core.relative(handoff.at, now);
  const from = `Handed off from ${channelName(handoff.channel)}${handoff.team ? ` to team ${handoff.team}` : ''} ${when}`;
  if (!item) {
    const heading = 'Waiting for Ploeg';
    return { label, description: [heading, handoff.team ?? '', when].filter(Boolean).join(' · '), heading, lines: [label, handoff.note, from].filter(Boolean), accessible: `${label}, ${heading}${handoff.team ? `, team ${handoff.team}` : ''}` };
  }
  const meta = core.workItemState(item.state);
  const reason = ['needs_human', 'stale', 'awaiting_review'].includes(item.state) ? core.listReason(item, { demo }) : null;
  const pr = pullRequestNumber(item.pullRequestUrl);
  const spend = demo ? 'demo, no spend' : item.spentUsd === null || item.spentUsd === undefined ? '' : `${core.money(item.spentUsd)} spent`;
  const heading = reason ? `${meta.label} · ${reason.chip}` : meta.label;
  const description = [reason?.chip ?? meta.label, pr ? `PR #${pr}` : '', item.team, spend, when].filter(Boolean).join(' · ');
  const lines = [label, reason ? reason.sentence : meta.description ?? '', reason ? reason.action : '', from, spend ? `Spend: ${spend}` : ''].filter(Boolean);
  return { label, description, heading, lines, accessible: `${label}, ${heading}, team ${item.team}` };
}

/** The status bar item for hand-offs in flight: "2 handed off" with a tooltip naming each, or undefined when none is, so it hides. */
export function handOffStatus(core: Core, list: HandOffList | undefined): { text: string; tooltip: string; waiting: number } | undefined {
  const flying = (list?.handoffs ?? []).filter(inFlight);
  if (!flying.length) return undefined;
  const waiting = flying.filter(entry => entry.workItem && ['needs_human', 'stale', 'awaiting_review'].includes(entry.workItem.state)).length;
  const lines = flying.slice(0, 8).map(entry => `${handOffTitle(entry)}: ${entry.workItem ? core.workItemState(entry.workItem.state).label : 'waiting for Ploeg'}`);
  const more = flying.length > 8 ? [`and ${flying.length - 8} more`] : [];
  return { text: `$(export) ${flying.length} handed off`, tooltip: [`${flying.length} of your hand-offs ${flying.length === 1 ? 'is' : 'are'} in flight${waiting ? `, ${waiting} waiting on you` : ''}`, ...lines, ...more, 'Click to open Handed off by you'].join('\n'), waiting };
}

/** Why a hand-off notifies: its Work Item started waiting on the person, or its pull request is ready for review. */
export type HandOffAlertKind = 'waiting' | 'ready';

/** One notification for one change of one hand-off. `key` names that state, so the same state never notifies twice, in any window. */
export type HandOffAlert = { key: string; kind: HandOffAlertKind; workItemId: string; title: string; pullRequestUrl: string; message: string };

/** The notification a hand-off's current state calls for, or undefined when it waits on nobody. */
export function handOffAlert(core: Core, handoff: HandOff, demo = false): HandOffAlert | undefined {
  const item = handoff.workItem;
  if (!item) return undefined;
  const title = handOffTitle(handoff);
  if (item.state === 'needs_human' || item.state === 'stale') {
    const reason = core.listReason(item, { demo });
    return { key: `${item.id}:waiting:${item.latestShift?.closedAt ?? item.updatedAt}`, kind: 'waiting', workItemId: item.id, title, pullRequestUrl: item.pullRequestUrl, message: `Your hand-off waits on you: ${title}${reason ? ` (${reason.chip})` : ''}` };
  }
  if (item.state === 'awaiting_review' && item.pullRequestUrl) {
    const pr = pullRequestNumber(item.pullRequestUrl);
    return { key: `${item.id}:ready:${item.pullRequestUrl}`, kind: 'ready', workItemId: item.id, title, pullRequestUrl: item.pullRequestUrl, message: `Your hand-off is ready for review: ${title}${pr ? ` (PR #${pr})` : ''}` };
  }
  return undefined;
}

/** Where the notifier keeps what it announced: the extension's global storage, shared by every window. */
export interface Memory {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

/** What one origin's hand-off notifier remembers: the last announced or seen key per Work Item. */
type Seen = Record<string, string>;

/**
 * Turns successive hand-off lists into one notification per state change, remembered in `memory` under one key per
 * workbench origin so another window, or this one after a reload, never announces the same state again. The first
 * list ever seen for an origin only records what already waits; a quiet observation (the demo) records without
 * announcing.
 */
export class HandOffNotifier {
  private readonly memory: Memory;
  constructor(memory: Memory) { this.memory = memory; }

  private static key(origin: string): string { return `unfold.handOffs.seen:${origin}`; }

  /** The notifications `list` calls for, recorded before they are returned so another window reading the same state later stays quiet. */
  async observe(core: Core, origin: string, list: HandOffList, quiet = false): Promise<HandOffAlert[]> {
    const stored = this.memory.get<Seen>(HandOffNotifier.key(origin));
    const seen: Seen = { ...(stored ?? {}) };
    const alerts: HandOffAlert[] = [];
    const listed = new Set<string>();
    for (const handoff of list.handoffs) {
      const alert = handOffAlert(core, handoff, list.demo);
      const id = handoff.workItem?.id;
      if (!id) continue;
      listed.add(id);
      if (!alert) { delete seen[id]; continue; }
      if (seen[id] === alert.key) continue;
      seen[id] = alert.key;
      if (stored && !quiet && !list.demo) alerts.push(alert);
    }
    for (const id of Object.keys(seen)) if (!listed.has(id)) delete seen[id];
    await this.memory.update(HandOffNotifier.key(origin), seen);
    return alerts;
  }
}

/** A question a Work Item waits on, as `public/core/blackboard.js` reads it. */
export type WaitingQuestion = WaitingQuestionShape;

/** What answering needs from the editor and the workbench, so the flow runs the same in a test as in VS Code. */
export type AnswerPorts = {
  ask(question: WaitingQuestion, index: number, total: number): PromiseLike<string | undefined>;
  confirm(choice: { title: string; detail: string; actions: { label: string; value: 'resume' | 'restart' }[] }): PromiseLike<'resume' | 'restart' | undefined>;
  answer(workItemId: string, questionId: string, body: { commandId: string; answer: string }): Promise<unknown>;
  requeue(workItemId: string, body: { commandId: string; expectedState: 'needs_human'; note?: string; resume?: true }): Promise<{ demo?: boolean; resumed?: boolean; fromRound?: number }>;
  commandId(): string;
};

/** How answering ended: sent with Ploeg's reply, nothing to answer, the demo, or the person dismissed a step and nothing was sent. */
export type AnswerOutcome = { status: 'sent'; message: string } | { status: 'none' | 'demo' | 'dismissed'; message: string };

/**
 * Answers the questions a Work Item waits on as the browser does: one input per question, then a confirmation that
 * states what sending does and costs, then each answer stored under its question and one requeue, or for a question
 * without an id one requeue whose note quotes it. Dismissing any input or the confirmation sends nothing.
 */
export async function answerWorkItem(core: Core, detail: PloegDetail, ports: AnswerPorts): Promise<AnswerOutcome> {
  const listed = core.waitingQuestions(detail);
  const one = listed.length ? null : core.waitingQuestion(detail, core.detailReason(detail));
  const questions = listed.length ? listed : one ? [one] : [];
  if (!questions.length) return { status: 'none', message: 'This Work Item no longer waits on a question. Open it to see where it stands.' };
  if (detail.demo) return { status: 'demo', message: 'This is the demo: nothing is stored, nothing restarts and nothing is spent. In a live workbench Answer sends your answer to Ploeg.' };
  const answers: string[] = [];
  for (const [index, question] of questions.entries()) {
    const typed = await ports.ask(question, index, questions.length);
    if (typed === undefined) return { status: 'dismissed', message: 'Nothing was sent.' };
    const problem = core.writeError(typed, core.answerLimit, 'Type your answer.');
    if (problem) return { status: 'dismissed', message: problem };
    answers.push(typed.trim());
  }
  const ids = questions.map(question => question.id).filter(Boolean);
  const resume = core.resumeOffer(detail);
  const canResume = Boolean(resume) && ids.length === questions.length && resume!.readyAfter(ids);
  const budget = detail.item.latestShift?.budgetUsd;
  const restartCost = `It spends from the Team's budget${typeof budget === 'number' ? `, up to ${core.money(budget)} like the last attempt` : ''}.`;
  const stored = ids.length ? 'Ploeg stores your answer with the question and records you as its author.' : 'Ploeg records you as the author.';
  const choice = canResume
    ? await ports.confirm({ title: `Answer and resume Round ${resume!.fromRound}?`, detail: `${stored} Ploeg then reopens Round ${resume!.fromRound} on the same branch and keeps the Rounds before it. This Round: up to ${core.money(resume!.roundCapUsd)}, in total up to ${core.money(resume!.poolUsd)}.\n\nOr start over: a new attempt from the start of the plan. ${restartCost}`, actions: [{ label: `Answer and resume Round ${resume!.fromRound}`, value: 'resume' }, { label: 'Answer and start over', value: 'restart' }] })
    : await ports.confirm({ title: 'Answer and restart this Work Item?', detail: `${ids.length ? 'Ploeg stores your answer with the question, then' : 'Ploeg'} opens a new attempt whose Runs read the question and your answer. ${restartCost} Ploeg records you as the author.`, actions: [{ label: 'Answer and restart', value: 'restart' }] });
  if (!choice) return { status: 'dismissed', message: 'Nothing was sent.' };
  const id = detail.item.id;
  const commandId = ports.commandId();
  const untyped = questions.findIndex(question => !question.id);
  const settledText = (result: { demo?: boolean; resumed?: boolean; fromRound?: number }) => result.demo ? 'This is the demo: nothing was stored, nothing restarted and nothing was spent.' : result.resumed ? `Answered. Ploeg resumed Round ${result.fromRound} with your answer.` : `Answered. Ploeg started the Work Item over from Round ${result.fromRound ?? 1} with your answer.`;
  if (untyped >= 0) return { status: 'sent', message: settledText(await ports.requeue(id, { commandId, expectedState: 'needs_human', note: core.answerNote(questions[untyped], answers[untyped]) })) };
  for (const [index, question] of questions.entries()) {
    try { await ports.answer(id, question.id, { commandId: `${commandId}-a${index + 1}`, answer: answers[index] }); }
    catch (error) { if ((error as { code?: string })?.code !== 'already_answered') throw error; }
  }
  return { status: 'sent', message: settledText(await ports.requeue(id, { commandId, expectedState: 'needs_human', ...(choice === 'resume' ? { resume: true as const } : {}) })) };
}
