import { createHash, randomBytes } from 'node:crypto';
import type { AppConfig, RepositoryAccess } from './types.ts';
import type { Store } from './store.ts';
import { RuntimeFailure } from './failures.ts';

export type LinkProvider = 'gitlab';
export type PublicLink = { provider: LinkProvider; host: string; configured: boolean; linked: boolean; login?: string; webUrl?: string; scopes?: string[]; linkedAt?: string; expiresAt?: string };
type LinkRecord = { accessToken: string; refreshToken?: string; expiresAt?: string; verifier: string; scopes: string[]; login: string; webUrl: string; linkedAt: string };
type Pending = { userId: string; verifier: string; createdAt: number };

const pendingTtlMs = 10 * 60_000;
const refreshWindowMs = 5 * 60_000;
const maxPending = 1000;

export class LinkError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

function base64url(bytes: Buffer): string { return bytes.toString('base64url'); }

export class Links {
  private readonly store: Store;
  private readonly config: AppConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly pending = new Map<string, Pending>();

  constructor(store: Store, config: AppConfig, fetchImpl: typeof fetch = fetch) { this.store = store; this.config = config; this.fetchImpl = fetchImpl; }

  private settings(): { baseUrl: string; clientId?: string; scopes: string[] } | undefined { return this.config.links?.gitlab; }
  private configured(): { baseUrl: string; clientId: string; scopes: string[] } {
    const settings = this.settings();
    if (!settings?.clientId) throw new LinkError(409, 'link_unconfigured', 'GitLab linking is not configured on this workbench.');
    return { baseUrl: settings.baseUrl, clientId: settings.clientId, scopes: settings.scopes };
  }
  private key(userId: string): string { return `link:gitlab:${userId}`; }
  private record(userId: string): LinkRecord | undefined { return this.store.getSecret<LinkRecord>(this.key(userId)); }

  redirectUri(): string { return `${this.config.baseUrl ?? `http://${this.config.host}:${this.config.port}`}/api/links/gitlab/callback`; }

  describe(userId: string): PublicLink {
    const settings = this.settings();
    const host = settings ? new URL(settings.baseUrl).host : 'gitlab.com';
    const record = settings?.clientId ? this.record(userId) : undefined;
    if (!record) return { provider: 'gitlab', host, configured: Boolean(settings?.clientId), linked: false };
    return { provider: 'gitlab', host, configured: true, linked: true, login: record.login, webUrl: record.webUrl, scopes: record.scopes, linkedAt: record.linkedAt, expiresAt: record.expiresAt };
  }

  begin(userId: string): string {
    const { baseUrl, clientId, scopes } = this.configured();
    const now = Date.now();
    for (const [state, item] of this.pending) if (now - item.createdAt > pendingTtlMs) this.pending.delete(state);
    if (this.pending.size >= maxPending) throw new LinkError(429, 'link_busy', 'Too many link attempts are waiting. Try again in a few minutes.');
    const verifier = base64url(randomBytes(48));
    const state = base64url(randomBytes(24));
    this.pending.set(state, { userId, verifier, createdAt: now });
    const url = new URL(`${baseUrl}/oauth/authorize`);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', this.redirectUri());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    url.searchParams.set('scope', scopes.join(' '));
    url.searchParams.set('code_challenge', base64url(createHash('sha256').update(verifier).digest()));
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  async complete(code: string, state: string): Promise<{ userId: string; link: PublicLink }> {
    const { baseUrl, clientId } = this.configured();
    const pending = this.pending.get(state);
    if (pending) this.pending.delete(state);
    if (!pending || Date.now() - pending.createdAt > pendingTtlMs) throw new LinkError(400, 'link_state', 'The link attempt expired or was not started here. Start again.');
    if (!/^[A-Za-z0-9._~-]{1,512}$/.test(code)) throw new LinkError(400, 'link_code', 'GitLab returned an invalid authorization code.');
    const token = await this.token(baseUrl, { client_id: clientId, grant_type: 'authorization_code', code, redirect_uri: this.redirectUri(), code_verifier: pending.verifier });
    const profile = await this.profile(baseUrl, token.accessToken);
    const record: LinkRecord = { ...token, verifier: pending.verifier, login: profile.login, webUrl: profile.webUrl, linkedAt: new Date().toISOString() };
    this.store.setSecret(this.key(pending.userId), record);
    return { userId: pending.userId, link: this.describe(pending.userId) };
  }

  async revoke(userId: string): Promise<void> {
    const record = this.record(userId);
    this.store.deleteSecret(this.key(userId));
    const settings = this.settings();
    if (!record || !settings?.clientId) return;
    for (const token of [record.accessToken, record.refreshToken]) {
      if (!token) continue;
      await this.fetchImpl(`${settings.baseUrl}/oauth/revoke`, {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ client_id: settings.clientId, token }), signal: AbortSignal.timeout(10_000), redirect: 'error',
      }).catch(() => undefined);
    }
  }

  async access(userId: string, repositoryUrl: string): Promise<RepositoryAccess | undefined> {
    const settings = this.settings();
    if (!settings?.clientId) return undefined;
    let origin: string;
    try { origin = new URL(repositoryUrl).origin; } catch { return undefined; }
    if (origin !== new URL(settings.baseUrl).origin) return undefined;
    let record = this.record(userId);
    if (!record) return undefined;
    if (record.expiresAt && Date.parse(record.expiresAt) - Date.now() < refreshWindowMs) {
      if (!record.refreshToken) throw new RuntimeFailure('workspace_setup', 'workspace', 'not_submitted', undefined, 'The GitLab link expired and cannot be refreshed. Link GitLab again.');
      const refreshed = await this.token(settings.baseUrl, { client_id: settings.clientId, grant_type: 'refresh_token', refresh_token: record.refreshToken, redirect_uri: this.redirectUri(), code_verifier: record.verifier });
      record = { ...record, ...refreshed };
      this.store.setSecret(this.key(userId), record);
    }
    return { username: 'oauth2', password: record.accessToken };
  }

  private async token(baseUrl: string, params: Record<string, string>): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: string; scopes: string[] }> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${baseUrl}/oauth/token`, {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(params), signal: AbortSignal.timeout(10_000), redirect: 'error',
      });
    } catch { throw new RuntimeFailure('connectivity', 'workspace', 'not_submitted', undefined, 'GitLab could not be reached to exchange the link token.'); }
    if (!response.ok) throw new RuntimeFailure(response.status >= 500 ? 'connectivity' : 'workspace_setup', 'workspace', 'not_submitted', response.status, `The GitLab OAuth exchange answered HTTP ${response.status}`);
    let data: any;
    try { data = await response.json(); } catch { throw new RuntimeFailure('workspace_setup', 'workspace', 'not_submitted', undefined, 'GitLab returned an invalid token response.'); }
    if (typeof data?.access_token !== 'string' || !data.access_token) throw new RuntimeFailure('workspace_setup', 'workspace', 'not_submitted', undefined, 'GitLab returned no access token.');
    const issued = typeof data.created_at === 'number' ? data.created_at * 1000 : Date.now();
    const expiresAt = typeof data.expires_in === 'number' && data.expires_in > 0 ? new Date(issued + data.expires_in * 1000).toISOString() : undefined;
    const scopes = typeof data.scope === 'string' ? data.scope.split(/\s+/).filter(Boolean) : [];
    return { accessToken: data.access_token, refreshToken: typeof data.refresh_token === 'string' && data.refresh_token ? data.refresh_token : undefined, expiresAt, scopes };
  }

  private async profile(baseUrl: string, accessToken: string): Promise<{ login: string; webUrl: string }> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${baseUrl}/api/v4/user`, { headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' }, signal: AbortSignal.timeout(10_000), redirect: 'error' });
    } catch { throw new LinkError(502, 'link_profile', 'GitLab could not be reached to confirm the linked account.'); }
    if (!response.ok) throw new LinkError(502, 'link_profile', `GitLab refused the linked account lookup with HTTP ${response.status}.`);
    let data: any;
    try { data = await response.json(); } catch { throw new LinkError(502, 'link_profile', 'GitLab returned an invalid account response.'); }
    if (typeof data?.username !== 'string' || !/^[A-Za-z0-9._-]{1,255}$/.test(data.username)) throw new LinkError(502, 'link_profile', 'GitLab returned no account name.');
    const webUrl = typeof data.web_url === 'string' && /^https?:\/\//.test(data.web_url) ? data.web_url.slice(0, 500) : `${baseUrl}/${data.username}`;
    return { login: data.username, webUrl };
  }
}
