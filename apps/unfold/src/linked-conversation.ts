import { randomUUID } from 'node:crypto';
import type { User } from './types.ts';
import { LinkedSessionError, type LinkedSession, type LinkedSessionStore } from './linked-sessions.ts';

/**
 * The bounds of the conversation relay: how long the plugin's poll is held, how long a reader waits for the machine,
 * how recently the plugin must have polled to count as relaying, and the size of what it may hand back.
 */
export const conversationLimits = { holdMs: 25_000, answerMs: 8_000, relayingMs: 40_000, wantsPerSession: 10, entries: 200, text: 6_001, id: 160, at: 40 } as const;

/** What one conversation entry is: a prompt the person typed, a text reply of the agent, or one redacted line per tool call. */
export const conversationKinds = ['prompt', 'reply', 'tool'] as const;
export type ConversationEntry = { id: string; kind: typeof conversationKinds[number]; text: string; at: string };

/** Why a conversation cannot be shown right now, so the page can say which. */
export type ConversationGap = 'ended' | 'not_relaying' | 'no_answer' | 'no_transcript';
export type ConversationRead =
  | { reachable: true; entries: ConversationEntry[]; cursor: number; truncated: boolean; restarted: boolean }
  | { reachable: false; reason: ConversationGap };

type Want = { id: string; sessionId: string; after: number | null; settle: (read: ConversationRead) => void };
type Poller = { hand: (wants: Want[]) => void };

const fail = (status: number, code: string, message: string): never => { throw new LinkedSessionError(status, code, message); };

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').replace(/[\0-\x09\x0b-\x1f\x7f]/g, ' ').slice(0, max) : '';
}

/** The entries a plugin handed back, with anything malformed dropped and every field clipped to its bound. */
export function parseEntries(value: unknown): ConversationEntry[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-conversationLimits.entries).flatMap(raw => {
    if (!raw || typeof raw !== 'object') return [];
    const entry = raw as Record<string, unknown>;
    const kind = conversationKinds.find(known => known === entry.kind);
    const body = text(entry.text, conversationLimits.text);
    return kind && body.trim() ? [{ id: text(entry.id, conversationLimits.id), kind, text: body, at: text(entry.at, conversationLimits.at) }] : [];
  });
}

/**
 * The conversation of a running Linked Session, relayed from its owner's machine and never stored. A reader asks;
 * the session's plugin, which holds a poll open here, reads its local transcript and hands the entries back; the
 * reader gets them and Unfold forgets them. Everything lives in this process's memory for at most
 * {@link conversationLimits.answerMs}. Only the session's owner may read it or relay it, an administrator neither.
 */
export class LinkedConversation {
  private sessions: LinkedSessionStore;
  private clock: () => number;
  private holdMs: number;
  private answerMs: number;
  private queued = new Map<string, Want[]>();
  private open = new Map<string, Want>();
  private pollers = new Map<string, Poller>();
  private polledAt = new Map<string, number>();

  constructor(sessions: LinkedSessionStore, options: { now?: () => number; holdMs?: number; answerMs?: number } = {}) {
    this.sessions = sessions;
    this.clock = options.now ?? Date.now;
    this.holdMs = options.holdMs ?? conversationLimits.holdMs;
    this.answerMs = options.answerMs ?? conversationLimits.answerMs;
  }

  private owned(user: User, sessionId: string): LinkedSession {
    const session = this.sessions.get(sessionId);
    return session && session.ownerId === user.id ? session : fail(404, 'not_found', 'Linked session not found.');
  }

  /** Whether the session's plugin polled recently enough to answer a reader. */
  relaying(sessionId: string): boolean {
    return this.pollers.has(sessionId) || this.clock() - (this.polledAt.get(sessionId) ?? -Infinity) < conversationLimits.relayingMs;
  }

  /**
   * Asks the owner's machine for the conversation since byte offset `after`, or for its last entries when `after` is
   * null, and waits at most {@link conversationLimits.answerMs} for the answer.
   */
  async read(user: User, sessionId: string, after: number | null): Promise<ConversationRead> {
    const session = this.owned(user, sessionId);
    if (session.status === 'ended') return { reachable: false, reason: 'ended' };
    if (!this.relaying(session.id)) return { reachable: false, reason: 'not_relaying' };
    const waiting = this.queued.get(session.id) ?? [];
    if (waiting.length >= conversationLimits.wantsPerSession) return fail(429, 'conversation_busy', 'This session already has as many conversation reads waiting as it takes.');
    return new Promise<ConversationRead>(resolve => {
      const want: Want = { id: randomUUID(), sessionId: session.id, after, settle: read => { clearTimeout(timer); this.forget(want); resolve(read); } };
      const timer = setTimeout(() => want.settle({ reachable: false, reason: 'no_answer' }), this.answerMs);
      timer.unref?.();
      this.queued.set(session.id, [...waiting, want]);
      this.handOut(session.id);
    });
  }

  /** The plugin's poll: the reads waiting for this session, at once when there are any, else after at most {@link conversationLimits.holdMs}. */
  async wants(user: User, sessionId: string): Promise<{ wants: { id: string; after: number | null }[] }> {
    const session = this.owned(user, sessionId);
    this.polledAt.set(session.id, this.clock());
    this.pollers.get(session.id)?.hand([]);
    const handed = await new Promise<Want[]>(resolve => {
      const poller: Poller = { hand: wants => { clearTimeout(timer); if (this.pollers.get(session.id) === poller) this.pollers.delete(session.id); resolve(wants); } };
      const timer = setTimeout(() => poller.hand([]), this.holdMs);
      timer.unref?.();
      this.pollers.set(session.id, poller);
      this.handOut(session.id);
    });
    this.polledAt.set(session.id, this.clock());
    return { wants: handed.map(want => ({ id: want.id, after: want.after })) };
  }

  /** The plugin hands back what one read asked for. A read that already timed out or is unknown is ignored. */
  answer(user: User, sessionId: string, wantId: string, value: Record<string, unknown>): { delivered: boolean } {
    const session = this.owned(user, sessionId);
    const want = this.open.get(wantId);
    if (!want || want.sessionId !== session.id) return { delivered: false };
    if (value.missing === true) { want.settle({ reachable: false, reason: 'no_transcript' }); return { delivered: true }; }
    const cursor = Number(value.cursor);
    want.settle({ reachable: true, entries: parseEntries(value.entries), cursor: Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0, truncated: value.truncated === true, restarted: value.restarted === true });
    return { delivered: true };
  }

  private handOut(sessionId: string): void {
    const poller = this.pollers.get(sessionId);
    const waiting = this.queued.get(sessionId);
    if (!poller || !waiting?.length) return;
    this.queued.delete(sessionId);
    for (const want of waiting) this.open.set(want.id, want);
    poller.hand(waiting);
  }

  private forget(want: Want): void {
    this.open.delete(want.id);
    const waiting = this.queued.get(want.sessionId)?.filter(entry => entry !== want) ?? [];
    if (waiting.length) this.queued.set(want.sessionId, waiting); else this.queued.delete(want.sessionId);
  }
}

/** Whether `path` is one of the conversation routes this module serves. */
export const conversationRoute = /^\/api\/linked-sessions\/([A-Za-z0-9_-]{8,128})\/conversation(?:\/(wants)|\/answers\/([0-9a-f-]{36}))?$/;
