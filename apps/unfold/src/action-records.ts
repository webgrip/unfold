import { AsyncLocalStorage } from 'node:async_hooks';
import type { DelegatedProof } from './person-proof.ts';

/** One state-changing call a person made, whatever channel it came through (system ADR-0037). */
export type ActionRecord = {
  id: number;
  at: string;
  userId: string;
  userName: string;
  role: string;
  channel: string;
  action: string;
  method: string;
  target: ActionTarget | null;
  inputs: Record<string, unknown>;
  confirmation: string | null;
  status: number;
  outcome: 'done' | 'refused' | 'failed';
};

/** What an action was about: a Ploeg Work Item, a workbench session, a tracker task, or a person or group the identity provider provisions. */
export type ActionTarget = { kind: 'work-item' | 'session' | 'task' | 'person' | 'group'; id: string };

/**
 * The channel and confirmation of the request being served, which the Ploeg client forwards as `X-Ploeg-Via` and
 * `X-Ploeg-Confirmation`, the credential kind that authenticated it, for a browser session the hash of its login,
 * whose kept sign-in tokens prove the person to Ploeg, and for a delegated credential the proof it carries.
 */
export type ActionContext = { via: string; confirmation: string | null; scope?: 'browser' | 'editor' | 'mcp'; signIn?: string; proof?: DelegatedProof };

/** Holds the {@link ActionContext} of the request being served. */
export const actionContext = new AsyncLocalStorage<ActionContext>();

const untracked = [/^\/api\/login$/, /^\/api\/auth\//, /^\/api\/insight\//, /^\/api\/ofrep\//, /^\/api\/linked-sessions\/events$/, /^\/api\/linked-sessions\/[^/]+\/traces$/, /^\/api\/linked-sessions\/[^/]+\/inbox$/, /^\/api\/linked-sessions\/[^/]+\/conversation(?:\/.*)?$/, /^\/api\/linked-sessions\/[^/]+\/permissions$/, /^\/api\/linked-sessions\/[^/]+\/permissions\/[^/]+\/(?:collect|withdraw)$/];
const identifier = /^(?:\d{1,19}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{12,128}|[A-Za-z0-9_-]{20,128})$/;
const secretKey = /token|secret|password|passphrase|credential|authorization|api[-_]?key|cookie/i;
const confirmationPattern = /^[A-Za-z0-9_.-]{1,100}:[0-9a-f]{64}$/;

/** Whether a request is an action to record: a state-changing method on an API route that is not sign-in or telemetry. */
export function isAction(method: string, path: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && path.startsWith('/api/') && !untracked.some(pattern => pattern.test(path));
}

/** The route of an action with its identifiers replaced by `:id`, such as `POST /api/ploeg/work-items/:id/approve`, and what it targets. */
export function describeAction(method: string, path: string): { action: string; target: ActionTarget | null } {
  const parts = path.split('/');
  const template = parts.map((part, index) => index > 1 && identifier.test(part) ? ':id' : part).join('/');
  const workItem = /^\/api\/ploeg\/work-items\/([^/]+)/.exec(path) ?? /^\/api\/linked-sessions\/[^/]+\/work-items\/([^/]+)/.exec(path);
  const session = /^\/api\/sessions\/([^/]+)/.exec(path);
  const task = /^\/api\/task-sources\/([^/]+)\/tasks\/([^/]+)/.exec(path);
  const target: ActionTarget | null = workItem ? { kind: 'work-item', id: workItem[1] } : session ? { kind: 'session', id: session[1] } : task ? { kind: 'task', id: `${task[1]}:${task[2]}` } : null;
  return { action: `${method} ${template}`, target };
}

/** The inputs of an action as recorded: secrets dropped, text clipped to 500 characters, at most 20 items and three levels deep. */
export function recordedInputs(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (depth >= 3) return '[omitted]';
  if (Array.isArray(value)) return value.slice(0, 20).map(item => recordedInputs(item, depth + 1));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 40).map(([key, item]) => [key, secretKey.test(key) ? '[redacted]' : recordedInputs(item, depth + 1)]));
  return '[omitted]';
}

/**
 * The channel a request came through: `browser`, the editor credential's name with the client the caller names in
 * `X-Unfold-Client`, or `mcp:<client name and version>` for `unfold-mcp` served over HTTP.
 */
export function channelOf(scope: 'browser' | 'editor' | 'mcp' | undefined, credentialLabel: string | undefined, client: unknown): string {
  const named = typeof client === 'string' ? client.replace(/[^ -~]/g, '').trim().slice(0, 80) : '';
  if (scope === 'mcp') return `mcp:${named || 'unnamed client'}`;
  const base = scope === 'editor' ? credentialLabel || 'editor' : 'browser';
  return named ? `${base} (${named})` : base;
}

/** The confirmation an MCP client sends in `X-Unfold-Confirmation`, `<id>:<sha256 of the agreed text>`, or null when absent or malformed. */
export function confirmationOf(value: unknown): string | null {
  return typeof value === 'string' && confirmationPattern.test(value) ? value : null;
}

/** How a response status reads in the record: 2xx done, 4xx refused, anything else failed. */
export function outcomeOf(status: number): ActionRecord['outcome'] {
  return status >= 200 && status < 300 ? 'done' : status >= 400 && status < 500 ? 'refused' : 'failed';
}

/** The `X-Ploeg-Via` and `X-Ploeg-Confirmation` headers for a Ploeg call made while serving a person's request (Ploeg ADR-0108); empty outside a request. */
export function ploegAttribution(): Record<string, string> {
  const context = actionContext.getStore();
  if (!context) return {};
  return { 'X-Ploeg-Via': context.via.replace(/[^ -~]/g, '').slice(0, 120), ...(context.confirmation ? { 'X-Ploeg-Confirmation': context.confirmation } : {}) };
}
