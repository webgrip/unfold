import type { IncomingMessage } from 'node:http';

/** The page origin VS Code's desktop Agents window connects from: it loads its renderer from `vscode-file://vscode-app` (VS Code 1.144 `src/vs/sessions/electron-browser/sessions.ts`). */
export const vscodeDesktopOrigin = 'vscode-file://vscode-app';

/** The browser origins the agent host accepts when `auth.agentHostOrigins` is not set. The workbench's own origin is always accepted as well. */
export const defaultAgentHostOrigins: readonly string[] = [vscodeDesktopOrigin];

function normalizedOrigin(value: string): string { return value.trim().replace(/\/+$/, '').toLowerCase(); }

/** Whether `value` is a page origin `auth.agentHostOrigins` accepts: `*`, or `scheme://host[:port]` without a path, query or credentials. */
export function isAgentHostOriginPattern(value: unknown): value is string {
  return typeof value === 'string' && (value === '*' || /^[a-z][a-z0-9+.-]*:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?\/?$/i.test(value.trim()));
}

/**
 * Whether a WebSocket upgrade may proceed by its `Origin` header. A request without one comes from a client that is not a web page,
 * which no other site can steer, and is accepted; a page is accepted only from an allowed origin or the workbench's own.
 */
export function agentHostOriginAllowed(origin: string | undefined, allowed: readonly string[] | undefined, baseUrl?: string): boolean {
  if (origin === undefined) return true;
  const list = allowed ?? defaultAgentHostOrigins;
  if (list.includes('*')) return true;
  const candidate = normalizedOrigin(origin);
  if (baseUrl) { try { if (normalizedOrigin(new URL(baseUrl).origin) === candidate) return true; } catch {} }
  return list.some(item => normalizedOrigin(item) === candidate);
}

/** How often report mode logs one unlisted origin. */
export const unlistedOriginLogMs = 3_600_000;

/** Whether report mode logs `origin` now, given when it last logged each origin; records the time when it does. */
export function reportUnlistedOrigin(origin: string, logged: Map<string, number>, now = Date.now()): boolean {
  const key = origin.trim().replace(/\/+$/, '').toLowerCase();
  const last = logged.get(key);
  if (last !== undefined && now - last < unlistedOriginLogMs) return false;
  logged.set(key, now);
  return true;
}

export type UpgradeToken = { token: string | null; via: 'header' | 'query' | 'none' };

/**
 * The connection token of an upgrade: `Authorization: Bearer <token>` first, then the `tkn` query parameter, which is the only place
 * VS Code 1.144's Agents window sends it, since a browser WebSocket cannot set headers.
 */
export function upgradeToken(req: IncomingMessage, url: URL): UpgradeToken {
  const header = req.headers.authorization;
  const bearer = typeof header === 'string' ? /^Bearer\s+(\S+)\s*$/i.exec(header)?.[1] : undefined;
  if (bearer) return { token: bearer, via: 'header' };
  const query = url.searchParams.get('tkn');
  return query ? { token: query, via: 'query' } : { token: null, via: 'none' };
}

/** The expiry a used token renews to: its lifetime from now, never past the absolute expiry of the sign-in that issued it, and never past its own expiry when no sign-in is bound. */
export function renewedExpiry(now: number, lifetimeMs: number, current: number, signInExpiresAt: number | undefined, bound: boolean): number {
  const cap = bound ? signInExpiresAt ?? current : current;
  return Math.min(now + lifetimeMs, cap);
}
