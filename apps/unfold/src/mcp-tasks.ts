import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { strictBase64url } from './mcp-auth.ts';

/** The MCP Tasks extension identifier, under `capabilities.extensions` (Tasks 2026-07-28). */
export const mcpTasksExtension = 'io.modelcontextprotocol/tasks';
/** How often a client should ask `tasks/get` about a hand-off; Claude Code clamps it to at most 30 seconds. */
export const taskPollIntervalMs = 30_000;
/** How long one derivation of a task's state answers repeated `tasks/get` requests. */
export const taskCacheMs = 15_000;
/** A task key signs new task ids for this long; the key before it still opens the ids it signed. */
export const taskKeyRotationMs = 30 * 86_400_000;

const secretId = 'mcp:task-keys';
const macBytes = 16;
const headerBytes = 14;
const maxTaskIdLength = 128;

/** One signing key of the task id key ring. */
export type TaskKey = { id: number; key: string; createdAt: string };
/** The keys that sign and open task ids: the first signs, every one opens. */
export type TaskKeyRing = { current: TaskKey; keys: TaskKey[] };
/** Where the key ring lives: Unfold's encrypted internal state. */
export type TaskKeyStore = { getSecret<T>(id: string): T | undefined; setSecret(id: string, value: unknown): void };

/** What a hand-off task id carries: the tracker task and Team, the highest Work Item id that existed before, and when it was handed off. */
export type HandOffRef = { source: string; task: string; team: string; baseline: bigint; handedAt: number };

/**
 * What `unfold-mcp` needs to answer a hand-off with a task. `enabled` evaluates the `mcp.tasks` flag for the caller,
 * `keys` reads the key ring, `tenantOf` names the Tenant that owns a task connection the caller reaches (undefined when
 * the caller does not reach it), and `cache` holds recent derivations across the requests of one process.
 */
export type McpTasks = { enabled(): Promise<boolean>; keys(): TaskKeyRing; tenantOf(source: string): string | undefined; cache: Map<string, { until: number; value: Record<string, any> }> };

/** Whether one request's client capabilities declare the Tasks extension. */
export function supportsTasks(capabilities: unknown): boolean {
  const declared = (capabilities as Record<string, any> | undefined)?.extensions?.[mcpTasksExtension];
  return Boolean(declared) && typeof declared === 'object' && !Array.isArray(declared);
}

function valid(entry: unknown): entry is TaskKey {
  const key = entry as TaskKey;
  return Boolean(key) && Number.isInteger(key.id) && key.id >= 0 && key.id <= 255 && typeof key.key === 'string' && strictBase64url(key.key)?.length === 32 && Number.isFinite(Date.parse(key.createdAt));
}

/** The task id key ring, made on first use and rotated once the current key is older than `taskKeyRotationMs`; it keeps the current and the previous key. */
export function taskKeyRing(store: TaskKeyStore, now: number): TaskKeyRing {
  const stored = store.getSecret<{ keys?: unknown }>(secretId);
  let keys = Array.isArray(stored?.keys) ? stored.keys.filter(valid) : [];
  const current = keys[0];
  if (!current || Date.parse(current.createdAt) + taskKeyRotationMs <= now) {
    const fresh: TaskKey = { id: current ? (current.id + 1) % 256 : 0, key: randomBytes(32).toString('base64url'), createdAt: new Date(now).toISOString() };
    keys = [fresh, ...(current ? [current] : [])];
    store.setSecret(secretId, { keys });
  }
  return { current: keys[0], keys: keys.slice(0, 2) };
}

function mac(key: TaskKey, body: Buffer, person: string, tenant: string): Buffer {
  return createHmac('sha256', Buffer.from(key.key, 'base64url')).update('unfold-mcp hand-off task v1\0').update(body).update('\0').update(person).update('\0').update(tenant).digest().subarray(0, macBytes);
}

/**
 * Seals a hand-off into a task id: the reference in the clear, then a MAC over it, the person and the Tenant. The
 * person and Tenant are not in the id; each `tasks/*` request supplies them from its own caller. Undefined when the
 * id would be longer than 128 characters, so the hand-off answers without a task.
 */
export function sealTaskId(ring: TaskKeyRing, ref: HandOffRef, person: string, tenant: string): string | undefined {
  const names = [ref.source, ref.task, ref.team];
  if (names.some(name => !name || name.includes('\0'))) return undefined;
  const header = Buffer.alloc(headerBytes);
  header.writeUInt8(1, 0);
  header.writeUInt8(ring.current.id, 1);
  header.writeBigUInt64BE(ref.baseline, 2);
  header.writeUInt32BE(ref.handedAt, 10);
  const body = Buffer.concat([header, Buffer.from(names.join('\0'), 'utf8')]);
  const id = Buffer.concat([body, mac(ring.current, body, person, tenant)]).toString('base64url');
  return id.length <= maxTaskIdLength ? id : undefined;
}

/** The hand-off a task id names, when one of the ring's keys signed it for this person and Tenant; otherwise undefined. */
export function openTaskId(ring: TaskKeyRing, taskId: unknown, person: string, tenantOf: (source: string) => string | undefined): HandOffRef | undefined {
  if (typeof taskId !== 'string' || taskId.length > maxTaskIdLength) return undefined;
  const bytes = strictBase64url(taskId);
  if (!bytes || bytes.length < headerBytes + macBytes + 5 || bytes.readUInt8(0) !== 1) return undefined;
  const key = ring.keys.find(entry => entry.id === bytes.readUInt8(1));
  if (!key) return undefined;
  const body = bytes.subarray(0, bytes.length - macBytes);
  const names = body.subarray(headerBytes).toString('utf8').split('\0');
  if (names.length !== 3 || names.some(name => !name)) return undefined;
  const [source, task, team] = names;
  const tenant = tenantOf(source);
  if (tenant === undefined) return undefined;
  const expected = mac(key, body, person, tenant);
  if (!timingSafeEqual(expected, bytes.subarray(bytes.length - macBytes))) return undefined;
  return { source, task, team, baseline: body.readBigUInt64BE(2), handedAt: body.readUInt32BE(10) };
}
