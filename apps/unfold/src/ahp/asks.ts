import type { Ask } from '../ask/types.ts';
import type { PloegAskAllowance } from '../ploeg.ts';
import type { Store } from '../store.ts';
import type { Session, User } from '../types.ts';
import { money } from '../../public/core/format.js';

type Json = Record<string, any>;

/** The part of the Ask service a session's chat calls (system ADR-0031). The host never answers a question itself. */
export interface ChatAskService {
  ask(user: User, workItemId: string, question: unknown): Promise<Ask>;
  about(user: User, workItemId: string): Promise<{ asks: Ask[]; allowance: PloegAskAllowance | null }>;
}

/** The two chat commands: `/ask` answers a question without reaching the crew, `/steer` sends the message towards a crew. */
export type ChatIntent = 'ask' | 'steer';

/**
 * Where an Ask sits in the chat. `turn` is the person's own turn, `inline` a part of the turn that is open (a question
 * sent while a crew works), `choice` the turn of the message choice whose **Ask instead** the person picked.
 */
export type AskPlacement = 'turn' | 'inline' | 'choice';

/**
 * What the chat keeps of one Ask to render it again after a reconnect or a restart: which Ask, where it sits among the
 * session's events, and the allowance Ploeg reported right after it. The question and answer stay in the Ask store,
 * apart from the session's events.
 */
export type ChatAskEntry = { askId: string; afterEvent: number; placement: AskPlacement; turnId?: string; text: string; at: string; allowance: { remainingUsd: number; limitUsd: number; resetAt: string } | null };

const maxEntries = 200;
const entriesKey = (sessionId: string) => `ahp-asks:${sessionId}`;
const commandPattern = /^\s*\/(ask|steer)(?=\s|$)\s*/i;

const commands: { command: ChatIntent; argumentHint: string; description: (askByDefault: boolean) => string }[] = [
  { command: 'ask', argumentHint: 'question', description: askByDefault => askByDefault ? 'Ask about this work. A message here is already an Ask; no crew reads it.' : 'Ask about this work instead of steering. Answered at once, never read by the crew, paid from your Team\'s Ask Allowance.' },
  { command: 'steer', argumentHint: 'message', description: () => 'Send the message towards a crew instead of asking: choose to run the session again with it.' },
];

/** The command a message starts with, typed or picked from the completion list, and the message without it. */
export function messageIntent(message: Json | undefined): { intent?: ChatIntent; text: string } {
  const raw = String(message?.text ?? '');
  const typed = commandPattern.exec(raw);
  const attachments: Json[] = Array.isArray(message?.attachments) ? message.attachments : [];
  const picked = attachments.map(attachment => attachment?._meta?.command).find((command): command is ChatIntent => command === 'ask' || command === 'steer');
  const intent = (typed?.[1].toLowerCase() as ChatIntent | undefined) ?? picked;
  return { ...(intent ? { intent } : {}), text: (typed ? raw.slice(typed[0].length) : raw).trim() };
}

/**
 * The `/ask` and `/steer` completions VS Code 1.141 lists when a person types `/` at the start of a message. Each item
 * carries the command in `_meta.command`, which VS Code turns into a command chip with its `argumentHint`.
 */
export function commandCompletions(text: string, offset: number, askByDefault: boolean): Json[] {
  const before = text.slice(0, Math.max(0, Math.min(offset, text.length)));
  const typed = /^(\s*)\/([a-z]*)$/i.exec(before);
  if (!typed) return [];
  const start = typed[1].length;
  return commands
    .filter(entry => entry.command !== 'steer' || askByDefault)
    .filter(entry => entry.command.startsWith(typed[2].toLowerCase()))
    .map(entry => ({ insertText: `/${entry.command} `, rangeStart: start, rangeEnd: before.length, attachment: { type: 'simple', label: `/${entry.command}`, _meta: { command: entry.command, description: entry.description(askByDefault), argumentHint: entry.argumentHint } } }));
}

const resetDay = (iso: string) => { const at = new Date(iso); return Number.isFinite(at.getTime()) ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(at) : 'an unknown date'; };

function spendLine(ask: Ask, entry: ChatAskEntry): string {
  const source = ask.source ?? (ask.demo ? 'record' : 'model');
  if (ask.status === 'answered' && source === 'record') return ask.demo ? 'Demo · answered from the record · no model call, nothing spent' : 'Answered from the record · no model call';
  if (ask.demo) return 'Demo · no model call, nothing spent';
  if (ask.status === 'refused') return 'Nothing was charged. An administrator can raise the allowance.';
  if (!ask.ploegAskId) return '';
  const cost = ask.costUsd === null ? 'cost pending in Ploeg' : `${money(ask.costUsd)}${ask.costStatus === 'settled' ? '' : ' (not settled yet)'}`;
  const left = entry.allowance ? ` · ${money(entry.allowance.remainingUsd)} of ${money(entry.allowance.limitUsd)} left this month, until ${resetDay(entry.allowance.resetAt)}` : '';
  return `${cost}${left}`;
}

/** The Markdown an Ask shows in the chat: a badge that says no crew read it, the answer or why there is none, and its spend. */
export function askMarkdown(ask: Ask | undefined, entry: ChatAskEntry): string {
  const quoted = entry.placement === 'inline' ? `> ${entry.text.replace(/\n/g, '\n> ')}\n\n` : '';
  if (!ask) return `**Ask** · not sent to the crew\n\n${quoted}This Ask is no longer stored.`;
  const body = ask.status === 'answered' ? ask.answer
    : ask.status === 'answering' ? 'No answer arrived: the workbench stopped while it was asking. Ask again.'
    : ask.status === 'refused' ? `Not answered. ${ask.failure ?? 'Ploeg refused the question.'}`
    : `Not answered. ${ask.failure ?? 'The question could not be answered.'}`;
  const spend = spendLine(ask, entry);
  return [`**Ask** · not sent to the crew`, `${quoted}${body}`, spend ? `*${spend}*` : ''].filter(Boolean).join('\n\n');
}

/** Why a session's chat cannot ask, or undefined when it can: Asks are about a Work Item, so a session needs one in Ploeg. */
export function askRefusal(service: ChatAskService | undefined, session: Session): string | undefined {
  if (!service) return 'this workbench does not answer Asks.';
  if (!session.execution?.workItemId) return 'this session has no Work Item in Ploeg to ask about.';
  return undefined;
}

/** The Asks asked in session chats, kept apart from the sessions' events, and the service that answers them. */
export class ChatAsks {
  private readonly store: Store;
  service?: ChatAskService;

  constructor(store: Store) { this.store = store; }

  /** Whether the host advertises `/ask`: an Ask service is connected. */
  get offered(): boolean { return Boolean(this.service); }

  /** Whether a question in this session's chat can be asked at all. */
  covers(session: Session): boolean { return !askRefusal(this.service, session); }

  entries(sessionId: string): ChatAskEntry[] { return this.store.getSecret<ChatAskEntry[]>(entriesKey(sessionId)) ?? []; }

  remember(sessionId: string, entry: ChatAskEntry): void {
    this.store.setSecret(entriesKey(sessionId), [...this.entries(sessionId), entry].slice(-maxEntries));
  }

  /** Asks the question through the Ask service and reads the allowance left after it. Throws when no Ask could be made. */
  async ask(user: User, session: Session, question: string): Promise<{ ask: Ask; allowance: ChatAskEntry['allowance'] }> {
    const refusal = askRefusal(this.service, session);
    if (refusal) throw new Error(`Asking is not possible: ${refusal}`);
    const workItemId = session.execution!.workItemId;
    const ask = await this.service!.ask(user, workItemId, question);
    if (ask.demo || ask.status === 'refused' || !ask.ploegAskId) return { ask, allowance: null };
    const about = await this.service!.about(user, workItemId).catch(() => undefined);
    const fresh = about?.asks.find(item => item.id === ask.id) ?? ask;
    const allowance = about?.allowance ? { remainingUsd: about.allowance.remainingUsd, limitUsd: about.allowance.limitUsd, resetAt: about.allowance.resetAt } : null;
    return { ask: fresh, allowance };
  }
}
