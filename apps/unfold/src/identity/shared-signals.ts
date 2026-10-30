import { createHash, createPublicKey, timingSafeEqual, verify as verifySignature, type KeyObject } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { normalIssuer, type SharedSignalsSettings, type TransmitterSettings } from './settings.ts';

/** Where transmitters push Security Event Tokens (RFC 8935). */
export const sharedSignalsPath = '/ssf/events';

const caep = 'https://schemas.openid.net/secevent/caep/event-type/';
const risc = 'https://schemas.openid.net/secevent/risc/event-type/';
const ssf = 'https://schemas.openid.net/secevent/ssf/event-type/';
const scimEvent = 'urn:ietf:params:scim:event:';

/** What Unfold does for one event: end every credential and keep the account on, turn it off, turn it back on, or nothing. */
export type SignalAction = 'reauthenticate' | 'disable' | 'enable' | 'acknowledge';

/** The events Unfold acts on (CAEP 1.0, RISC 1.0, RFC 9967), and the stream events it acknowledges (SSF 1.0). */
export const handledEvents: Readonly<Record<string, SignalAction>> = {
  [`${caep}session-revoked`]: 'reauthenticate',
  [`${caep}credential-change`]: 'reauthenticate',
  [`${caep}token-claims-change`]: 'reauthenticate',
  [`${risc}account-credential-change-required`]: 'reauthenticate',
  [`${risc}credential-compromise`]: 'reauthenticate',
  [`${risc}account-disabled`]: 'disable',
  [`${risc}account-purged`]: 'disable',
  [`${risc}account-enabled`]: 'enable',
  [`${scimEvent}prov:deactivate`]: 'disable',
  [`${scimEvent}prov:delete`]: 'disable',
  [`${scimEvent}prov:activate`]: 'enable',
  [`${ssf}verification`]: 'acknowledge',
  [`${ssf}stream-updated`]: 'acknowledge',
};

/** A subject identifier (RFC 9493, SSF 1.0 complex subjects, RFC 9967 `scim`), as far as Unfold reads one. */
export type Subject = Record<string, unknown> & { format?: unknown };

/** One event of a verified SET: its type, what Unfold does for it, and the subject it is about. */
export type VerifiedEvent = { type: string; action: SignalAction | 'ignore'; subject: Subject | undefined };

/** A verified SET: its transmitter, `jti`, and events. */
export type VerifiedSet = { transmitter: TransmitterSettings; jti: string; issuedAt: number; events: VerifiedEvent[] };

/** Why a SET was refused, as an RFC 8935 section 2.3 error code. */
export class SetError extends Error {
  readonly err: 'invalid_request' | 'invalid_key' | 'invalid_issuer' | 'invalid_audience' | 'authentication_failed' | 'access_denied';
  constructor(err: SetError['err'], description: string) { super(description); this.err = err; }
}

const algorithms: Record<string, string> = { RS256: 'sha256', RS384: 'sha384', RS512: 'sha512', PS256: 'sha256', PS384: 'sha384', PS512: 'sha512', ES256: 'sha256', ES384: 'sha384', ES512: 'sha512' };
const maxSetBytes = 65_536;
const clockSkewMs = 60_000;
const keysTtlMs = 600_000;
const refetchAfterMs = 30_000;

function decode(segment: string): Record<string, unknown> {
  try {
    const value = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch {}
  throw new SetError('invalid_request', 'The SET is not a signed JWT.');
}

function equal(left: string, right: string): boolean {
  return timingSafeEqual(createHash('sha256').update(left).digest(), createHash('sha256').update(right).digest());
}

/**
 * Verifies Security Event Tokens (RFC 8417) pushed by the configured transmitters: a JWS whose `typ` is `secevent+jwt`
 * (SSF 1.0 section 4.1.1), signed with a key from the transmitter's JWKS, naming that transmitter as `iss` and this
 * workbench as an audience, with a `jti` and an `iat` no older than `maxAgeHours`.
 */
export class SetVerifier {
  private readonly settings: SharedSignalsSettings;
  private readonly fetchImpl: typeof fetch;
  private readonly keys = new Map<string, { at: number; keys: Map<string, KeyObject> }>();
  private readonly now: () => number;

  constructor(settings: SharedSignalsSettings, options: { fetch?: typeof fetch; now?: () => number } = {}) {
    this.settings = settings;
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }

  /** Whether `req` carries the Authorization header the transmitter's stream was given, when its settings name one. */
  authorized(req: IncomingMessage, transmitter: TransmitterSettings): boolean {
    if (!transmitter.authorizationEnv) return true;
    const expected = process.env[transmitter.authorizationEnv];
    const header = req.headers.authorization;
    return Boolean(expected && typeof header === 'string' && equal(header, expected));
  }

  async verify(token: string): Promise<VerifiedSet> {
    const parts = token.trim().split('.');
    if (token.length > maxSetBytes || parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new SetError('invalid_request', 'The SET is not a signed JWT.');
    const header = decode(parts[0]);
    const claims = decode(parts[1]);
    const typ = typeof header.typ === 'string' ? header.typ.toLowerCase() : '';
    if (typ !== 'secevent+jwt' && typ !== 'application/secevent+jwt') throw new SetError('invalid_request', 'The SET header must have typ secevent+jwt.');
    if (typeof header.alg !== 'string' || !(header.alg in algorithms)) throw new SetError('invalid_key', 'The SET uses an unsupported signature algorithm.');
    const issuer = typeof claims.iss === 'string' ? claims.iss : '';
    const transmitter = this.settings.transmitters.find(item => normalIssuer(item.issuer) === normalIssuer(issuer));
    if (!transmitter) throw new SetError('invalid_issuer', 'The SET names an issuer this workbench does not trust.');
    const key = await this.key(transmitter, typeof header.kid === 'string' ? header.kid : undefined);
    const options = header.alg.startsWith('PS') ? { key, padding: 6, saltLength: Number(header.alg.slice(2)) / 8 } : header.alg.startsWith('ES') ? { key, dsaEncoding: 'ieee-p1363' as const } : { key };
    if (!verifySignature(algorithms[header.alg], Buffer.from(`${parts[0]}.${parts[1]}`), options as never, Buffer.from(parts[2], 'base64url'))) throw new SetError('invalid_key', 'The SET signature does not verify.');
    const audience = transmitter.audience ?? this.settings.audience;
    const named = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!named.some(item => typeof item === 'string' && normalIssuer(item) === normalIssuer(audience))) throw new SetError('invalid_audience', 'The SET is for another audience.');
    if (typeof claims.jti !== 'string' || !claims.jti || claims.jti.length > 256) throw new SetError('invalid_request', 'The SET has no jti.');
    if (typeof claims.iat !== 'number' || !Number.isFinite(claims.iat)) throw new SetError('invalid_request', 'The SET has no iat.');
    const issuedAt = claims.iat * 1000;
    const now = this.now();
    if (issuedAt > now + clockSkewMs) throw new SetError('invalid_request', 'The SET was issued in the future.');
    if (issuedAt < now - this.settings.maxAgeHours * 3_600_000) throw new SetError('invalid_request', 'The SET is older than this workbench accepts.');
    if (!claims.events || typeof claims.events !== 'object' || Array.isArray(claims.events) || !Object.keys(claims.events).length) throw new SetError('invalid_request', 'The SET carries no events.');
    const topSubject = claims.sub_id && typeof claims.sub_id === 'object' ? claims.sub_id as Subject : undefined;
    const events = Object.entries(claims.events as Record<string, unknown>).slice(0, 20).map(([type, payload]): VerifiedEvent => {
      const inner = payload && typeof payload === 'object' ? (payload as { subject?: unknown }).subject : undefined;
      const subject = topSubject ?? (inner && typeof inner === 'object' ? inner as Subject : undefined);
      return { type, action: Object.hasOwn(handledEvents, type) ? handledEvents[type] : 'ignore', subject };
    });
    return { transmitter, jti: claims.jti, issuedAt, events };
  }

  private async key(transmitter: TransmitterSettings, kid: string | undefined): Promise<KeyObject> {
    const cached = this.keys.get(transmitter.name);
    const pick = (keys: Map<string, KeyObject>) => kid ? keys.get(kid) : keys.size === 1 ? [...keys.values()][0] : undefined;
    const now = this.now();
    let found = cached && now - cached.at < keysTtlMs ? pick(cached.keys) : undefined;
    if (!found && (!cached || now - cached.at >= refetchAfterMs)) {
      const keys = await this.fetchKeys(transmitter);
      this.keys.set(transmitter.name, { at: now, keys });
      found = pick(keys);
    }
    if (!found) throw new SetError('invalid_key', 'The SET was signed with a key the transmitter does not publish.');
    return found;
  }

  private async fetchKeys(transmitter: TransmitterSettings): Promise<Map<string, KeyObject>> {
    let data: unknown;
    try {
      const response = await this.fetchImpl(transmitter.jwksUri, { signal: AbortSignal.timeout(10_000), redirect: 'error', headers: { accept: 'application/json' } });
      if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw new Error(String(response.status)); }
      data = await response.json();
    } catch { throw new SetError('invalid_key', 'The transmitter signing keys could not be fetched.'); }
    const keys = new Map<string, KeyObject>();
    const list = data && typeof data === 'object' && Array.isArray((data as { keys?: unknown }).keys) ? (data as { keys: Record<string, unknown>[] }).keys : [];
    list.forEach((jwk, index) => {
      if (jwk?.use !== undefined && jwk.use !== 'sig') return;
      try { keys.set(typeof jwk.kid === 'string' ? jwk.kid : `#${index}`, createPublicKey({ key: jwk as never, format: 'jwk' })); } catch {}
    });
    return keys;
  }
}

/** Reads a pushed SET body: `application/secevent+jwt`, at most 64 KiB. */
export async function readSet(req: IncomingMessage): Promise<string> {
  if (!/^application\/secevent\+jwt\b/i.test(req.headers['content-type'] ?? '')) throw new SetError('invalid_request', 'Push the SET as application/secevent+jwt.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxSetBytes) throw new SetError('invalid_request', 'The SET is larger than 64 KiB.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Answers a push with RFC 8935's error shape. */
export function refuseSet(res: ServerResponse, error: SetError, status = 400): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Language': 'en', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ err: error.err, description: error.message }));
}

/** The short name of an event type for records and logs, such as `caep/session-revoked` or `scim/prov:deactivate`. */
export function eventName(type: string): string {
  if (type.startsWith(caep)) return `caep/${type.slice(caep.length)}`;
  if (type.startsWith(risc)) return `risc/${type.slice(risc.length)}`;
  if (type.startsWith(ssf)) return `ssf/${type.slice(ssf.length)}`;
  if (type.startsWith(scimEvent)) return `scim/${type.slice(scimEvent.length)}`;
  return type.slice(0, 120);
}
