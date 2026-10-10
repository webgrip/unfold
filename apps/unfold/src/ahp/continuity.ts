import type { Store } from '../store.ts';

type Json = Record<string, any>;

/** How many sequence numbers the host reserves in the store at a time. A restart resumes after the whole reservation. */
export const sequenceReservation = 1000;
/** How long an ended session nobody subscribes to keeps its projection and summary in memory: ten minutes. */
export const idleSessionMs = 600_000;

const sequenceKey = 'ahp-server-seq';
const clientsKey = 'ahp-known-clients';
const activeClientsKey = 'ahp-active-clients';

/**
 * The host's `serverSeq`, which never repeats or moves backwards across a restart. It reserves numbers in blocks in the
 * store and resumes after the last reservation, so a client's pre-restart `lastSeenServerSeq` is always behind it.
 */
export class ServerSequence {
  private value: number;
  private ceiling: number;
  private readonly store: Store;
  private readonly reservation: number;

  constructor(store: Store, reservation = sequenceReservation) {
    this.store = store; this.reservation = reservation;
    const reserved = store.getSecret<unknown>(sequenceKey);
    this.value = this.ceiling = typeof reserved === 'number' && Number.isSafeInteger(reserved) && reserved > 0 ? reserved : 0;
  }

  get current(): number { return this.value; }

  /** Moves the sequence to `next`, reserving a new block first when `next` passes the reservation. A lower value is ignored. */
  advanceTo(next: number): void {
    if (!Number.isSafeInteger(next) || next <= this.value) return;
    if (next > this.ceiling) { this.ceiling = next + this.reservation; this.store.setSecret(sequenceKey, this.ceiling); }
    this.value = next;
  }
}

/** What the host remembers about a client so it can `reconnect`: whose it is, its session spelling and what it said about itself. */
export type RememberedClient<Scheme extends string = string> = { userId: string; scheme: Scheme; clientInfo?: { name?: string; version?: string } };

/** The clients the host remembers for `reconnect`, newest last, at most `limit`, kept in the store across restarts. */
export class RememberedClients<Scheme extends string = string> {
  private readonly entries: Map<string, RememberedClient<Scheme>>;
  private readonly store: Store;
  private readonly limit: number;

  constructor(store: Store, limit: number) {
    this.store = store; this.limit = limit;
    const stored = store.getSecret<unknown>(clientsKey);
    const rows = Array.isArray(stored) ? stored.filter((row): row is [string, RememberedClient<Scheme>] => Array.isArray(row) && typeof row[0] === 'string' && typeof row[1]?.userId === 'string' && typeof row[1]?.scheme === 'string') : [];
    this.entries = new Map(rows.slice(-limit));
  }

  get(clientId: string): RememberedClient<Scheme> | undefined { return this.entries.get(clientId); }

  remember(clientId: string, client: RememberedClient<Scheme>): void {
    this.entries.delete(clientId);
    this.entries.set(clientId, client);
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
    this.store.setSecret(clientsKey, [...this.entries]);
  }
}

/** Reads the active clients a previous process kept, by public session id. */
export function restoreActiveClients(store: Store): Map<string, Map<string, Json>> {
  const stored = store.getSecret<unknown>(activeClientsKey);
  const restored = new Map<string, Map<string, Json>>();
  if (!Array.isArray(stored)) return restored;
  for (const row of stored) {
    if (!Array.isArray(row) || typeof row[0] !== 'string' || !Array.isArray(row[1])) continue;
    const clients = new Map((row[1] as unknown[]).filter((entry): entry is [string, Json] => Array.isArray(entry) && typeof entry[0] === 'string' && Boolean(entry[1]) && typeof entry[1] === 'object'));
    if (clients.size) restored.set(row[0], clients);
  }
  return restored;
}

/** Keeps the active clients of every session in the store, so a restart does not forget who was attached. */
export function saveActiveClients(store: Store, activeClients: ReadonlyMap<string, ReadonlyMap<string, Json>>): void {
  const rows = [...activeClients].filter(([, clients]) => clients.size).map(([publicId, clients]) => [publicId, [...clients]]);
  if (rows.length) store.setSecret(activeClientsKey, rows); else store.deleteSecret(activeClientsKey);
}

/**
 * Decides which cached sessions to evict: those `evictable` for at least `idleMs` in a row, measured from the first
 * sweep that found them so. A session that stops being evictable starts over.
 */
export class IdleSessions {
  private readonly since = new Map<string, number>();
  readonly idleMs: number;

  constructor(idleMs = idleSessionMs) { this.idleMs = idleMs; }

  sweep(cached: Iterable<string>, evictable: (id: string) => boolean, now: number): string[] {
    const due: string[] = [];
    const seen = new Set<string>();
    for (const id of cached) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (!evictable(id)) { this.since.delete(id); continue; }
      const since = this.since.get(id);
      if (since === undefined) this.since.set(id, now);
      else if (now - since >= this.idleMs) { this.since.delete(id); due.push(id); }
    }
    for (const id of [...this.since.keys()]) if (!seen.has(id)) this.since.delete(id);
    return due;
  }

  forget(id: string): void { this.since.delete(id); }
}
