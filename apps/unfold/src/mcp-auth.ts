import { createPublicKey, verify as verifySignature, constants, type KeyObject } from 'node:crypto';

/** What `unfold-mcp` over HTTP accepts as an access token, and where its clients learn how to get one. */
export type McpHttpSettings = { resource: string; issuer: string; jwksUrl?: string; clientIds: string[]; scope: string; requestScopes: string[]; maxLifetimeMs: number };

/** The verified facts of an access token that an MCP request carries. */
export type AccessToken = { subject: string; client: string; scopes: string[]; expiresAt: number; email?: string; emailVerified: boolean; username?: string };

/** Clock skew tolerated on `exp`, `nbf` and `iat`. */
export const maxLeewayMs = 60_000;
/** Longest accepted `exp` minus `iat`, unless `UNFOLD_MCP_MAX_TOKEN_LIFETIME` says otherwise. */
export const defaultMaxLifetimeMs = 600_000;

const keySetMaxAgeMs = 3_600_000;
const unknownKeyPauseMs = 30_000;
const failedFetchPauseMs = 2_000;
const maxDocumentBytes = 1_048_576;
const algorithms: Record<string, { hash: string; kty: 'RSA' | 'EC'; pss?: number; curve?: string; size?: number }> = {
  RS256: { hash: 'sha256', kty: 'RSA' }, RS384: { hash: 'sha384', kty: 'RSA' }, RS512: { hash: 'sha512', kty: 'RSA' },
  PS256: { hash: 'sha256', kty: 'RSA', pss: 32 }, PS384: { hash: 'sha384', kty: 'RSA', pss: 48 }, PS512: { hash: 'sha512', kty: 'RSA', pss: 64 },
  ES256: { hash: 'sha256', kty: 'EC', curve: 'P-256', size: 32 }, ES384: { hash: 'sha384', kty: 'EC', curve: 'P-384', size: 48 }, ES512: { hash: 'sha512', kty: 'EC', curve: 'P-521', size: 66 },
};

/** A token that is not acceptable; `reason` is safe to show the client. */
export class TokenRefused extends Error {
  readonly reason: string;
  constructor(reason: string) { super(reason); this.reason = reason; }
}

/** The issuer's signing keys could not be fetched, so no token can be judged either way. */
export class KeysUnavailable extends Error {}

function httpUrl(value: string, name: string, extra = ''): URL {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(`${name} must be an http(s) URL${extra}`); }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.host || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error(`${name} must be an http(s) URL without credentials, query or fragment${extra}`);
  return parsed;
}

/**
 * Reads the `UNFOLD_MCP_*` variables. Without `UNFOLD_MCP_RESOURCE` the HTTP transport is off and this returns
 * undefined; with it, the issuer and at least one client id are required. There are no default domains.
 */
export function mcpHttpSettings(env: Record<string, string | undefined> = process.env): McpHttpSettings | undefined {
  const resourceValue = env.UNFOLD_MCP_RESOURCE?.trim();
  if (!resourceValue) {
    const stray = Object.keys(env).filter(key => key.startsWith('UNFOLD_MCP_') && env[key]?.trim());
    if (stray.length) throw new Error(`${stray.sort().join(', ')} ${stray.length === 1 ? 'is' : 'are'} set, but UNFOLD_MCP_RESOURCE is not; set it to the exact public URL clients connect to, or unset the others`);
    return undefined;
  }
  const resource = httpUrl(resourceValue, 'UNFOLD_MCP_RESOURCE', ', the exact public URL clients connect to');
  if (!/^\/[A-Za-z0-9][A-Za-z0-9._~/-]{0,199}$/.test(resource.pathname) || resource.pathname.endsWith('/') || /^\/(?:api|\.well-known|healthz|readyz)(?:\/|$)/.test(resource.pathname)) throw new Error('UNFOLD_MCP_RESOURCE must name its own path, such as /mcp, outside /api/ and /.well-known/');
  const issuer = env.UNFOLD_MCP_ISSUER?.trim() ?? '';
  if (!issuer) throw new Error('UNFOLD_MCP_ISSUER is required when UNFOLD_MCP_RESOURCE is set');
  httpUrl(issuer, 'UNFOLD_MCP_ISSUER');
  const jwksUrl = env.UNFOLD_MCP_JWKS_URL?.trim() || undefined;
  if (jwksUrl) httpUrl(jwksUrl, 'UNFOLD_MCP_JWKS_URL');
  const clientIds = [...new Set((env.UNFOLD_MCP_CLIENT_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean))];
  if (!clientIds.length || clientIds.some(id => !/^[A-Za-z0-9_.:-]{1,200}$/.test(id))) throw new Error('UNFOLD_MCP_CLIENT_IDS must list the pre-registered client ids, separated by commas');
  const scope = env.UNFOLD_MCP_SCOPE?.trim() || 'unfold:mcp';
  if (!/^[!#-[\]-~]{1,64}$/.test(scope)) throw new Error('UNFOLD_MCP_SCOPE must be one scope');
  const requestScopes = (env.UNFOLD_MCP_REQUEST_SCOPES ?? '').split(/\s+/).filter(Boolean);
  if (requestScopes.some(item => !/^[!#-[\]-~]{1,64}$/.test(item)) || requestScopes.length > 20) throw new Error('UNFOLD_MCP_REQUEST_SCOPES holds an invalid scope');
  if (!requestScopes.includes(scope)) requestScopes.push(scope);
  const lifetime = env.UNFOLD_MCP_MAX_TOKEN_LIFETIME?.trim();
  let maxLifetimeMs = defaultMaxLifetimeMs;
  if (lifetime) {
    const match = /^(\d{1,5})(s|m|h)$/.exec(lifetime);
    maxLifetimeMs = match ? Number(match[1]) * { s: 1000, m: 60_000, h: 3_600_000 }[match[2] as 's' | 'm' | 'h'] : NaN;
    if (!(maxLifetimeMs > 0 && maxLifetimeMs <= 86_400_000)) throw new Error('UNFOLD_MCP_MAX_TOKEN_LIFETIME must be a duration such as 10m, at most 24h');
  }
  return { resource: resource.href, issuer, ...(jwksUrl ? { jwksUrl } : {}), clientIds, scope, requestScopes, maxLifetimeMs };
}

/** The well-known path of a resource's protected resource metadata, with the resource's path inserted (RFC 9728 section 3.1). */
export function metadataPath(resourcePath: string): string {
  return `/.well-known/oauth-protected-resource${resourcePath.replace(/\/+$/, '')}`;
}

/** The RFC 9728 protected resource metadata document for these settings. */
export function resourceMetadata(settings: McpHttpSettings): Record<string, unknown> {
  return { resource: settings.resource, authorization_servers: [settings.issuer], scopes_supported: settings.requestScopes, bearer_methods_supported: ['header'], resource_name: 'Unfold' };
}

function segment(value: string): any {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new TokenRefused('the token is not a JWT');
  try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); } catch { throw new TokenRefused('the token is not a JWT'); }
}

type Key = { key: KeyObject; kty: string; curve?: string; alg?: string };

class KeySet {
  private readonly issuer: string;
  private readonly jwksUrl?: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private keys?: Map<string, Key>;
  private fetchedAt = 0;
  private triedAt = 0;
  private inflight?: Promise<void>;

  constructor(issuer: string, jwksUrl: string | undefined, fetcher: typeof fetch, now: () => number) { this.issuer = issuer; this.jwksUrl = jwksUrl; this.fetcher = fetcher; this.now = now; }

  async key(kid: string | undefined): Promise<Key> {
    const now = this.now();
    const stale = !this.keys || now - this.fetchedAt > keySetMaxAgeMs;
    const known = this.lookup(kid);
    const pause = this.keys ? unknownKeyPauseMs : failedFetchPauseMs;
    if ((stale || !known) && (!this.triedAt || now - this.triedAt >= pause)) {
      this.triedAt = now;
      this.inflight ??= this.fetch().then(keys => { this.keys = keys; this.fetchedAt = this.now(); }, error => { if (!this.keys) throw new KeysUnavailable(String(error?.message ?? error)); }).finally(() => { this.inflight = undefined; });
    }
    if (this.inflight) await this.inflight;
    if (!this.keys) throw new KeysUnavailable('the issuer\'s signing keys have not been fetched');
    const key = this.lookup(kid);
    if (!key) throw new TokenRefused('the token\'s key id is not among the issuer\'s signing keys');
    return key;
  }

  async ready(): Promise<void> {
    if (this.keys) return;
    try { await this.key(undefined); } catch (error) { if (error instanceof KeysUnavailable) throw error; }
  }

  private lookup(kid: string | undefined): Key | undefined {
    if (!this.keys) return undefined;
    if (kid === undefined) return this.keys.size === 1 ? [...this.keys.values()][0] : undefined;
    return this.keys.get(kid);
  }

  private async fetch(): Promise<Map<string, Key>> {
    let jwksUrl = this.jwksUrl;
    if (!jwksUrl) {
      const discovery = await this.json(`${this.issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`);
      if (discovery?.issuer !== this.issuer) throw new Error(`discovery names issuer ${JSON.stringify(discovery?.issuer)}, not the configured one`);
      if (typeof discovery.jwks_uri !== 'string' || !/^https?:\/\//.test(discovery.jwks_uri)) throw new Error('discovery has no http(s) jwks_uri');
      jwksUrl = discovery.jwks_uri as string;
    }
    const document = await this.json(jwksUrl);
    const keys = new Map<string, Key>();
    for (const jwk of Array.isArray(document?.keys) ? document.keys : []) {
      if (!jwk || typeof jwk !== 'object' || (jwk.use !== undefined && jwk.use !== 'sig') || !['RSA', 'EC'].includes(jwk.kty)) continue;
      try {
        const key = createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e, crv: jwk.crv, x: jwk.x, y: jwk.y }, format: 'jwk' });
        if (jwk.kty === 'RSA' && (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) continue;
        keys.set(typeof jwk.kid === 'string' ? jwk.kid : '', { key, kty: jwk.kty, ...(jwk.kty === 'EC' ? { curve: String(jwk.crv) } : {}), ...(typeof jwk.alg === 'string' ? { alg: jwk.alg } : {}) });
      } catch {}
    }
    if (!keys.size) throw new Error('the key set holds no usable signing key');
    return keys;
  }

  private async json(url: string): Promise<any> {
    const response = await this.fetcher(url, { headers: { accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(5000) });
    if (response.status !== 200) throw new Error(`${url} answered ${response.status}`);
    const text = await response.text();
    if (text.length > maxDocumentBytes) throw new Error(`${url} answered more than 1 MiB`);
    return JSON.parse(text);
  }
}

/** Checks JWT access tokens for one issuer: asymmetric signatures only, pinned issuer and clients, short lifetimes. */
export class AccessTokenVerifier {
  private readonly settings: McpHttpSettings;
  private readonly keys: KeySet;
  private readonly now: () => number;

  constructor(settings: McpHttpSettings, options: { fetch?: typeof fetch; now?: () => number } = {}) {
    this.settings = settings;
    this.now = options.now ?? Date.now;
    this.keys = new KeySet(settings.issuer, settings.jwksUrl, options.fetch ?? fetch, this.now);
  }

  /** Resolves when the issuer's keys have been fetched once; rejects with KeysUnavailable while they cannot be. */
  ready(): Promise<void> { return this.keys.ready(); }

  /** Verifies one access token; throws TokenRefused for any token this server must not accept. */
  async verify(token: string): Promise<AccessToken> {
    const parts = token.split('.');
    if (parts.length !== 3 || token.length > 16_384) throw new TokenRefused('the token is not a JWT');
    const header = segment(parts[0]);
    const claims = segment(parts[1]);
    if (!header || typeof header !== 'object' || !claims || typeof claims !== 'object' || Array.isArray(claims)) throw new TokenRefused('the token is not a JWT');
    const algorithm = typeof header.alg === 'string' && Object.hasOwn(algorithms, header.alg) ? algorithms[header.alg] : undefined;
    if (!algorithm) throw new TokenRefused('the token is not signed with an accepted asymmetric algorithm');
    if (header.crit !== undefined) throw new TokenRefused('the token names critical header parameters this server does not understand');
    if (header.kid !== undefined && typeof header.kid !== 'string') throw new TokenRefused('the token\'s key id is not a string');
    const key = await this.keys.key(header.kid);
    if (key.kty !== algorithm.kty || (algorithm.curve && key.curve !== algorithm.curve) || (key.alg && key.alg !== header.alg)) throw new TokenRefused('the token\'s algorithm does not match its signing key');
    if (!/^[A-Za-z0-9_-]+$/.test(parts[2])) throw new TokenRefused('the token\'s signature does not verify');
    const signature = Buffer.from(parts[2], 'base64url');
    if (algorithm.size && signature.length !== algorithm.size * 2) throw new TokenRefused('the token\'s signature does not verify');
    const options = algorithm.pss ? { key: key.key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: algorithm.pss } : algorithm.size ? { key: key.key, dsaEncoding: 'ieee-p1363' as const } : { key: key.key };
    let valid = false;
    try { valid = verifySignature(algorithm.hash, Buffer.from(`${parts[0]}.${parts[1]}`), options, signature); } catch {}
    if (!valid) throw new TokenRefused('the token\'s signature does not verify');
    return this.check(claims);
  }

  private check(claims: Record<string, unknown>): AccessToken {
    const now = this.now();
    if (claims.iss !== this.settings.issuer) throw new TokenRefused('the token was issued by another issuer');
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audience.some(entry => typeof entry === 'string' && this.settings.clientIds.includes(entry))) throw new TokenRefused('the token is meant for another audience');
    if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)) throw new TokenRefused('the token has no exp');
    if (typeof claims.iat !== 'number' || !Number.isFinite(claims.iat)) throw new TokenRefused('the token has no iat');
    if (claims.exp * 1000 <= now - maxLeewayMs) throw new TokenRefused('the token has expired');
    if (claims.iat * 1000 > now + maxLeewayMs || (typeof claims.nbf === 'number' && claims.nbf * 1000 > now + maxLeewayMs)) throw new TokenRefused('the token is not valid yet');
    if ((claims.exp - claims.iat) * 1000 > this.settings.maxLifetimeMs) throw new TokenRefused(`the token lives longer than ${Math.round(this.settings.maxLifetimeMs / 1000)}s`);
    if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) throw new TokenRefused('the token has no sub');
    if (typeof claims.azp !== 'string' || !claims.azp || typeof claims.scope !== 'string' || !claims.scope.trim()) throw new TokenRefused('the token has no azp or scope; an ID token is not an access token');
    if (!this.settings.clientIds.includes(claims.azp)) throw new TokenRefused('the token was issued to a client this server does not accept');
    const email = typeof claims.email === 'string' && /^[^\s@]{1,200}@[^\s@]{1,200}$/.test(claims.email) ? claims.email.toLowerCase() : undefined;
    const username = typeof claims.preferred_username === 'string' && claims.preferred_username.trim() ? claims.preferred_username.trim().slice(0, 100) : undefined;
    return { subject: claims.sub, client: claims.azp, scopes: claims.scope.split(/\s+/).filter(Boolean), expiresAt: claims.exp * 1000, ...(email ? { email } : {}), emailVerified: claims.email_verified === true, ...(username ? { username } : {}) };
  }
}

/** An RFC 6750 `WWW-Authenticate` challenge pointing at the resource metadata. */
export function challenge(settings: McpHttpSettings, error?: { code: string; description: string }): string {
  const quote = (value: string) => `"${value.replace(/["\\]/g, '\'').replace(/[^\x20-\x7e]/g, '')}"`;
  const parts = [
    ...(error ? [`error=${quote(error.code)}`, `error_description=${quote(error.description)}`] : []),
    `scope=${quote(settings.requestScopes.join(' '))}`,
    `resource_metadata=${quote(new URL(metadataPath(new URL(settings.resource).pathname), settings.resource).href)}`,
  ];
  return `Bearer ${parts.join(', ')}`;
}
