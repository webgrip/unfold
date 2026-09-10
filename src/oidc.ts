import { createHash, createPublicKey, randomBytes, verify as verifySignature, type KeyObject } from 'node:crypto';
import type { AppConfig, UserRole } from './types.ts';

export type OidcSettings = { issuer: string; clientId: string; clientSecret?: string; scopes: string[]; displayName: string; roleClaim: string; groupsClaim: string; roles: Record<UserRole, string[]> };
export type OidcIdentity = { id: string; name: string; role: UserRole; subject: string; email?: string };
type Discovery = { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string };
type Pending = { verifier: string; nonce: string; createdAt: number; editor?: string };

const pendingTtlMs = 10 * 60_000;
const maxPending = 1000;
const clockSkewMs = 60_000;

export class OidcError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

function base64url(bytes: Buffer): string { return bytes.toString('base64url'); }
function decodeSegment(segment: string): any {
  try { return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')); } catch { throw new OidcError(502, 'oidc_token', 'The identity provider returned an unreadable token.'); }
}

export class Oidc {
  private readonly config: AppConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly pending = new Map<string, Pending>();
  private discovery?: { at: number; value: Discovery };
  private keys?: { at: number; value: Map<string, KeyObject> };

  constructor(config: AppConfig, fetchImpl: typeof fetch = fetch) { this.config = config; this.fetchImpl = fetchImpl; }

  settings(): OidcSettings | undefined { return this.config.auth.oidc; }
  configured(): boolean { return Boolean(this.config.auth.oidc); }
  redirectUri(): string { return `${this.config.baseUrl ?? `http://${this.config.host}:${this.config.port}`}/api/auth/oidc/callback`; }

  private required(): OidcSettings {
    const settings = this.settings();
    if (!settings) throw new OidcError(404, 'oidc_unconfigured', 'Single sign-on is not configured on this workbench.');
    return settings;
  }

  private async discover(): Promise<Discovery> {
    if (this.discovery && Date.now() - this.discovery.at < 3_600_000) return this.discovery.value;
    const { issuer } = this.required();
    let response: Response;
    try { response = await this.fetchImpl(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10_000), redirect: 'error' }); }
    catch { throw new OidcError(502, 'oidc_discovery', 'The identity provider could not be reached.'); }
    if (!response.ok) throw new OidcError(502, 'oidc_discovery', `The identity provider answered HTTP ${response.status} to discovery.`);
    let data: any;
    try { data = await response.json(); } catch { throw new OidcError(502, 'oidc_discovery', 'The identity provider returned invalid discovery data.'); }
    for (const key of ['issuer', 'authorization_endpoint', 'token_endpoint', 'jwks_uri']) if (typeof data?.[key] !== 'string' || !/^https?:\/\//.test(data[key])) throw new OidcError(502, 'oidc_discovery', `Discovery is missing ${key}.`);
    if (data.issuer.replace(/\/$/, '') !== issuer.replace(/\/$/, '')) throw new OidcError(502, 'oidc_discovery', 'The identity provider names a different issuer than configured.');
    this.discovery = { at: Date.now(), value: data };
    return data;
  }

  private async signingKeys(refresh = false): Promise<Map<string, KeyObject>> {
    if (!refresh && this.keys && Date.now() - this.keys.at < 600_000) return this.keys.value;
    const discovery = await this.discover();
    let response: Response;
    try { response = await this.fetchImpl(discovery.jwks_uri, { signal: AbortSignal.timeout(10_000), redirect: 'error' }); }
    catch { throw new OidcError(502, 'oidc_keys', 'The identity provider signing keys could not be fetched.'); }
    if (!response.ok) throw new OidcError(502, 'oidc_keys', `The identity provider answered HTTP ${response.status} for its signing keys.`);
    let data: any;
    try { data = await response.json(); } catch { throw new OidcError(502, 'oidc_keys', 'The identity provider returned invalid signing keys.'); }
    const keys = new Map<string, KeyObject>();
    for (const jwk of Array.isArray(data?.keys) ? data.keys : []) {
      if (typeof jwk?.kid !== 'string' || (jwk.use && jwk.use !== 'sig')) continue;
      try { keys.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' })); } catch {}
    }
    this.keys = { at: Date.now(), value: keys };
    return keys;
  }

  async begin(editor?: string): Promise<string> {
    const settings = this.required();
    const discovery = await this.discover();
    const now = Date.now();
    for (const [state, item] of this.pending) if (now - item.createdAt > pendingTtlMs) this.pending.delete(state);
    if (this.pending.size >= maxPending) throw new OidcError(429, 'oidc_busy', 'Too many sign-in attempts are waiting. Try again in a few minutes.');
    const verifier = base64url(randomBytes(48));
    const state = base64url(randomBytes(24));
    const nonce = base64url(randomBytes(24));
    this.pending.set(state, { verifier, nonce, createdAt: now, ...(editor ? { editor } : {}) });
    const url = new URL(discovery.authorization_endpoint);
    url.searchParams.set('client_id', settings.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', settings.scopes.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', base64url(createHash('sha256').update(verifier).digest()));
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  async complete(code: string, state: string): Promise<OidcIdentity & { editor?: string }> {
    const settings = this.required();
    const pending = this.pending.get(state);
    if (pending) this.pending.delete(state);
    if (!pending || Date.now() - pending.createdAt > pendingTtlMs) throw new OidcError(400, 'oidc_state', 'The sign-in attempt expired or was not started here. Start again.');
    if (!/^[A-Za-z0-9._~-]{1,2048}$/.test(code)) throw new OidcError(400, 'oidc_code', 'The identity provider returned an invalid authorization code.');
    const discovery = await this.discover();
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: this.redirectUri(), client_id: settings.clientId, code_verifier: pending.verifier });
    if (settings.clientSecret) body.set('client_secret', settings.clientSecret);
    let response: Response;
    try { response = await this.fetchImpl(discovery.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: body.toString(), signal: AbortSignal.timeout(10_000), redirect: 'error' }); }
    catch { throw new OidcError(502, 'oidc_exchange', 'The identity provider could not be reached to complete sign-in.'); }
    if (!response.ok) throw new OidcError(502, 'oidc_exchange', `The identity provider refused the sign-in exchange with HTTP ${response.status}.`);
    let data: any;
    try { data = await response.json(); } catch { throw new OidcError(502, 'oidc_exchange', 'The identity provider returned an invalid token response.'); }
    if (typeof data?.id_token !== 'string') throw new OidcError(502, 'oidc_exchange', 'The identity provider returned no identity token.');
    const claims = await this.validate(data.id_token, pending.nonce);
    return { ...this.identity(claims), ...(pending.editor ? { editor: pending.editor } : {}) };
  }

  private async validate(token: string, nonce: string): Promise<Record<string, unknown>> {
    const settings = this.required();
    const discovery = await this.discover();
    const parts = token.split('.');
    if (parts.length !== 3) throw new OidcError(502, 'oidc_token', 'The identity token is malformed.');
    const header = decodeSegment(parts[0]);
    const claims = decodeSegment(parts[1]);
    const algorithms: Record<string, string | null> = { RS256: 'sha256', RS384: 'sha384', RS512: 'sha512', ES256: 'sha256', ES384: 'sha384', ES512: 'sha512', PS256: 'sha256' };
    if (typeof header?.alg !== 'string' || !(header.alg in algorithms) || typeof header.kid !== 'string') throw new OidcError(502, 'oidc_token', 'The identity token uses an unsupported signature.');
    let key = (await this.signingKeys()).get(header.kid) ?? (await this.signingKeys(true)).get(header.kid);
    if (!key) throw new OidcError(502, 'oidc_token', 'The identity token was signed with an unknown key.');
    const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
    const signature = Buffer.from(parts[2], 'base64url');
    const options = header.alg.startsWith('PS') ? { key, padding: 6, saltLength: 32 } : header.alg.startsWith('ES') ? { key, dsaEncoding: 'ieee-p1363' as const } : { key };
    if (!verifySignature(algorithms[header.alg]!, signed, options as any, signature)) throw new OidcError(502, 'oidc_token', 'The identity token signature is invalid.');
    const now = Date.now();
    if (typeof claims?.iss !== 'string' || claims.iss.replace(/\/$/, '') !== discovery.issuer.replace(/\/$/, '')) throw new OidcError(502, 'oidc_token', 'The identity token names another issuer.');
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audience.includes(settings.clientId)) throw new OidcError(502, 'oidc_token', 'The identity token is for another application.');
    if (typeof claims.exp !== 'number' || claims.exp * 1000 < now - clockSkewMs) throw new OidcError(502, 'oidc_token', 'The identity token has expired.');
    if (typeof claims.iat === 'number' && claims.iat * 1000 > now + clockSkewMs) throw new OidcError(502, 'oidc_token', 'The identity token is from the future.');
    if (claims.nonce !== nonce) throw new OidcError(502, 'oidc_token', 'The identity token does not match this sign-in.');
    if (typeof claims.sub !== 'string' || !claims.sub) throw new OidcError(502, 'oidc_token', 'The identity token names no subject.');
    return claims;
  }

  identity(claims: Record<string, unknown>): OidcIdentity {
    const settings = this.required();
    const subject = String(claims.sub);
    const email = typeof claims.email === 'string' && /^[^\s@]{1,200}@[^\s@]{1,200}$/.test(claims.email) ? claims.email.toLowerCase() : undefined;
    const claimed = claims[settings.roleClaim];
    const groups = Array.isArray(claims[settings.groupsClaim]) ? (claims[settings.groupsClaim] as unknown[]).filter((group): group is string => typeof group === 'string') : [];
    let role: UserRole | undefined;
    for (const candidate of ['admin', 'operator', 'viewer'] as const) {
      if (claimed === candidate) { role = candidate; break; }
      if (settings.roles[candidate].some(group => groups.includes(group))) { role = candidate; break; }
    }
    if (!role) throw new OidcError(403, 'oidc_not_entitled', `${email ?? subject} signed in, but holds none of the groups this workbench admits.`);
    const preferred = [claims.preferred_username, claims.name, email, subject].find((value): value is string => typeof value === 'string' && value.trim().length > 0)!;
    const name = preferred.trim().slice(0, 100);
    const id = 'oidc-' + createHash('sha256').update(`${settings.issuer.replace(/\/$/, '')}|${subject}`).digest('hex').slice(0, 32);
    return { id, name, role, subject, ...(email ? { email } : {}) };
  }
}
