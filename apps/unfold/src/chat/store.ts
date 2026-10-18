import type { DatabaseSync } from 'node:sqlite';
import type { ChatRecord, ChatTurn } from './types.ts';

/** Unfold's own record of every chat and its turns. Ploeg authorizes and meters each message; the conversation text stays here. */
export class ChatStore {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, updated_at TEXT NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS chats_owner ON chats(owner_id, updated_at);
      CREATE TABLE IF NOT EXISTS chat_turns (chat_id TEXT NOT NULL REFERENCES chats(id), turn_id TEXT NOT NULL, seq INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (chat_id, turn_id));
      CREATE INDEX IF NOT EXISTS chat_turns_seq ON chat_turns(chat_id, seq);
    `);
  }

  save(chat: ChatRecord): void {
    this.db.prepare('INSERT INTO chats(id,owner_id,updated_at,body) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, body=excluded.body').run(chat.id, chat.owner.id, chat.updatedAt, JSON.stringify(chat));
  }

  get(id: string): ChatRecord | undefined {
    const row = this.db.prepare('SELECT body FROM chats WHERE id=?').get(id) as { body: string } | undefined;
    return row ? JSON.parse(row.body) as ChatRecord : undefined;
  }

  /** One person's chats, most recently changed first. */
  owned(ownerId: string, limit = 200): ChatRecord[] {
    return (this.db.prepare('SELECT body FROM chats WHERE owner_id=? ORDER BY updated_at DESC, id LIMIT ?').all(ownerId, limit) as { body: string }[]).map(row => JSON.parse(row.body) as ChatRecord);
  }

  saveTurn(turn: ChatTurn): void {
    this.db.prepare('INSERT INTO chat_turns(chat_id,turn_id,seq,body) VALUES(?,?,?,?) ON CONFLICT(chat_id, turn_id) DO UPDATE SET body=excluded.body').run(turn.chatId, turn.id, turn.seq, JSON.stringify(turn));
  }

  /** At most the last `limit` turns of a chat, oldest first. */
  turns(chatId: string, limit = 200): ChatTurn[] {
    return (this.db.prepare('SELECT body FROM chat_turns WHERE chat_id=? ORDER BY seq DESC LIMIT ?').all(chatId, limit) as { body: string }[]).map(row => JSON.parse(row.body) as ChatTurn).reverse();
  }

  nextSeq(chatId: string): number {
    const row = this.db.prepare('SELECT MAX(seq) AS seq FROM chat_turns WHERE chat_id=?').get(chatId) as { seq: number | null } | undefined;
    return Number(row?.seq ?? 0) + 1;
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM chat_turns WHERE chat_id=?').run(id);
    this.db.prepare('DELETE FROM chats WHERE id=?').run(id);
  }
}
