import { createHash, randomBytes } from 'node:crypto';
import type { AppConfig, RepositoryAccess } from './types.ts';
import type { Store } from './store.ts';
import { RuntimeFailure } from './failures.ts';

export type LinkProvider = 'gitlab' | 'clickup';
export type PublicLink = { provider: LinkProvider; host: string; configured: boolean; oauth: boolean; linked: boolean; method?: 'oauth' | 'token'; login?: string; webUrl?: string; scopes?: string[]; linkedAt?: string; expiresAt?: string };
type LinkRecord = { accessToken: string; refreshToken?: string; expiresAt?: string; verifier?: string; scopes: string[]; login: string; webUrl: string; linkedAt: string; method?: 'oauth' | 'token' };
type Pending = { provider: LinkProvider; userId: string; verifier: string; createdAt: number };

export const linkProviders: LinkProvider[] = ['gitlab', 'clickup'];
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

  private gitlab(): { baseUrl: string; clientId?: string; scopes: string[] } | undefined { return this.config.links?.gitlab; }
  private clickup(): { clientId?: string; clientSecret?: string; apiUrl: string; appUrl: string } | undefined { return this.config.links?.clickup; }
  private hasOauth(provider: LinkProvider): boolean { return provider === 'gitlab' ? Boolean(this.gitlab()?.clientId) : Boolean(this.clickup()?.clientId && this.clickup()?.clientSecret); }
  private isConfigured(provider: LinkProvider): boolean { return provider === 'clickup' || this.hasOauth(provider) || Boolean(this.gitlab()); }
  private listed(provider: LinkProvider): boolean { return provider === 'gitlab' ? Boolean(this.config.links?.gitlab) : Boolean(this.config.links?.clickup) || (this.config.taskSources ?? []).some(source => source.provider === 'clickup'); }
  private host(provider: LinkProvider): string { return provider === 'gitlab' ? new URL(this.gitlab()?.baseUrl ?? 'https://gitlab.com').host : new URL(this.clickup()?.appUrl ?? 'https://app.clickup.com').host; }
  private key(provider: LinkProvider, userId: string): string { return `link:${provider}:${userId}`; }
  private record(provider: LinkProvider, userId: string): LinkRecord | undefined { return this.store.getSecret<LinkRecord>(this.key(provider, userId)); }

  redirectUri(provider: LinkProvider): string { return `${this.config.baseUrl ?? `http://${this.config.host}:${this.config.port}`}/api/links/${provider}/callback`; }

  describe(userId: string, provider: LinkProvider = 'gitlab'): PublicLink {
    const record = this.record(provider, userId);
    if (!record) return { provider, host: this.host(provider), configured: this.isConfigured(provider), oauth: this.hasOauth(provider), linked: false };
    return { provider, host: this.host(provider), configured: true, oauth: this.hasOauth(provider), linked: true, method: record.method ?? 'oauth', login: record.login, webUrl: record.webUrl, scopes: record.scopes, linkedAt: record.linkedAt, expiresAt: record.expiresAt };
  }

  describeAll(userId: string): PublicLink[] { return linkProviders.filter(provider => this.listed(provider)).map(provider => this.describe(userId, provider)); }

  describeFor(userId: string, repositoryUrl: string): PublicLink | undefined {
    const gitlab = this.gitlab();
    if (!gitlab) return undefined;
    try { if (new URL(repositoryUrl).origin !== new URL(gitlab.baseUrl).origin) return undefined; } catch { return undefined; }
    return this.describe(userId, 'gitlab');
  }

  begin(provider: LinkProvider, userId: string): string {
    if (!this.hasOauth(provider)) throw new LinkError(409, 'link_unconfigured', `${provider === 'gitlab' ? 'GitLab' : 'ClickUp'} has no OAuth application on this workbench; paste a personal token instead.`);
    const now = Date.now();
    for (const [state, item] of this.pending) if (now - item.createdAt > pendingTtlMs) this.pending.delete(state);
    if (this.pending.size >= maxPending) throw new LinkError(429, 'link_busy', 'Too many link attempts are waiting. Try again in a few minutes.');
    const verifier = base64url(randomBytes(48));
    const state = base64url(randomBytes(24));
    this.pending.set(state, { provider, userId, verifier, createdAt: now });
    if (provider === 'gitlab') {
      const { baseUrl, clientId, scopes } = this.gitlab()!;
      const url = new URL(`${baseUrl}/oauth/authorize`);
      url.searchParams.set('client_id', clientId!);
      url.searchParams.set('redirect_uri', this.redirectUri(provider));
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('state', state);
      url.searchParams.set('scope', scopes.join(' '));
      url.searchParams.set('code_challenge', base64url(createHash('sha256').update(verifier).digest()));
      url.searchParams.set('code_challenge_method', 'S256');
      return url.toString();
    }
    const { clientId, appUrl } = this.clickup()!;
    const url = new URL(`${appUrl}/api`);
    url.searchParams.set('client_id', clientId!);
    url.searchParams.set('redirect_uri', this.redirectUri(provider));
    url.searchParams.set('state', state);
    return url.toString();
  }

  async complete(provider: LinkProvider, code: string, state: string): Promise<{ userId: string; link: PublicLink }> {
    if (!this.hasOauth(provider)) throw new LinkError(409, 'link_unconfigured', 'This link has no OAuth application on this workbench.');
    const pending = this.pending.get(state);
    if (pending) this.pending.delete(state);
    if (!pending || pending.provider !== provider || Date.now() - pending.createdAt > pendingTtlMs) throw new LinkError(400, 'link_state', 'The link attempt expired or was not started here. Start again.');
    if (!/^[A-Za-z0-9._~-]{1,512}$/.test(code)) throw new LinkError(400, 'link_code', 'The provider returned an invalid authorization code.');
    let record: LinkRecord;
    if (provider === 'gitlab') {
      const { baseUrl, clientId } = this.gitlab()!;
      const token = await this.gitlabToken(baseUrl, { client_id: clientId!, grant_type: 'authorization_code', code, redirect_uri: this.redirectUri(provider), code_verifier: pending.verifier });
      const profile = await this.gitlabProfile(baseUrl, token.accessToken);
      record = { ...token, verifier: pending.verifier, login: profile.login, webUrl: profile.webUrl, linkedAt: new Date().toISOString(), method: 'oauth' };
    } else {
      const { clientId, clientSecret, apiUrl, appUrl } = this.clickup()!;
      const url = new URL(`${apiUrl}/api/v2/oauth/token`);
      url.searchParams.set('client_id', clientId!);
      url.searchParams.set('client_secret', clientSecret!);
      url.searchParams.set('code', code);
      let response: Response;
      try { response = await this.fetchImpl(url, { method: 'POST', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10_000), redirect: 'error' }); }
      catch { throw new RuntimeFailure('connectivity', 'workspace', 'not_submitted', undefined, 'ClickUp could not be reached to exchange the link code.'); }
      if (!response.ok) throw new RuntimeFailure(response.status >= 500 ? 'connectivity' : 'workspace_setup', 'workspace', 'not_submitted', response.status, `The ClickUp OAuth exchange answered HTTP ${response.status}`);
      let data: any;
      try { data = await response.json(); } catch { throw new RuntimeFailure('workspace_setup', 'workspace', 'not_submitted', undefined, 'ClickUp returned an invalid token response.'); }
      if (typeof data?.access_token !== 'string' || !data.access_token) throw new RuntimeFailure('workspace_setup', 'workspace', 'not_submitted', undefined, 'ClickUp returned no access token.');
      const profile = await this.clickupProfile(apiUrl, data.access_token);
      record = { accessToken: data.access_token, scopes: [], login: profile.login, webUrl: appUrl, linkedAt: new Date().toISOString(), method: 'oauth' };
    }
    this.store.setSecret(this.key(provider, pending.userId), record);
    return { userId: pending.userId, link: this.describe(pending.userId, provider) };
  }

  async paste(provider: LinkProvider, userId: string, token: string): Promise<PublicLink> {
    if (typeof token !== 'string' || !token.trim() || token.length > 4096 || /[^\x21-\x7e]/.test(token.trim())) throw new LinkError(400, 'link_token', 'Paste the token exactly as the provider shows it.');
    const value = token.trim();
    let record: LinkRecord;
    if (provider === 'clickup') {
      const profile = await this.clickupProfile(this.clickup()?.apiUrl ?? 'https://api.clickup.com', value);
      record = { accessToken: value, scopes: [], login: profile.login, webUrl: this.clickup()?.appUrl ?? 'https://app.clickup.com', linkedAt: new Date().toISOString(), method: 'token' };
    } else {
      const baseUrl = this.gitlab()?.baseUrl ?? 'https://gitlab.com';
      const profile = await this.gitlabProfile(baseUrl, value, 'PRIVATE-TOKEN');
      record = { accessToken: value, scopes: [], login: profile.login, webUrl: profile.webUrl, linkedAt: new Date().toISOString(), method: 'token' };
    }
    this.store.setSecret(this.key(provider, userId), record);
    return this.describe(userId, provider);
  }

  async revoke(provider: LinkProvider, userId: string): Promise<void> {
    const record = this.record(provider, userId);
    this.store.deleteSecret(this.key(provider, userId));
    if (!record || provider !== 'gitlab' || record.method === 'token' || !this.gitlab()?.clientId) return;
    const { baseUrl, clientId } = this.gitlab()!;
    for (const token of [record.accessToken, record.refreshToken]) {
      if (!token) continue;
      await this.fetchImpl(`${baseUrl}/oauth/revoke`, {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ client_id: clientId, token }), signal: AbortSignal.timeout(10_000), redirect: 'error',
      }).catch(() => undefined);
    }
  }

  async token(userId: string, provider: LinkProvider): Promise<{ token: string; type: 'bearer' | 'private' } | undefined> {
    if (provider === 'gitlab') {
      const record = this.record('gitlab', userId);
      if (!record) return undefined;
      if (record.method === 'token') return { token: record.accessToken, type: 'private' };
      const access = await this.access(userId, this.gitlab()?.baseUrl ?? 'https://gitlab.com');
      return access ? { token: access.password, type: 'bearer' } : undefined;
    }
    const record = this.record('clickup', userId);
    return record ? { token: record.accessToken, type: 'private' } : undefined;
  }

  async access(userId: string, repositoryUrl: string): Promise<RepositoryAccess | undefined> {
    const settings = this.gitlab() ?? { baseUrl: 'https://gitlab.com', clientId: undefined, scopes: [] };
    let origin: string;
    try { origin = new URL(repositoryUrl).origin; } catch { return undefined; }
    if (origin !== new URL(settings.baseUrl).origin) return undefined;
    let record = this.record('gitlab', userId);
    if (!record) return undefined;
    if (record.method === 'token') return { username: 'oauth2', password: record.accessToken };
    if (!settings.clientId) return undefined;
    if (record.expiresAt && Date.parse(record.expiresAt) - Date.now() < refreshWindowMs) {
      if (!record.refreshToken) throw new RuntimeFailure('workspace_setup', 'workspace', 'not_submitted', undefined, 'The GitLab link expired and cannot be refreshed. Link GitLab again.');
      const refreshed = await this.gitlabToken(settings.baseUrl, { client_id: settings.clientId, grant_type: 'refresh_token', refresh_token: record.refreshToken, redirect_uri: this.redirectUri('gitlab'), code_verifier: record.verifier ?? '' });
      record = { ...record, ...refreshed };
      this.store.setSecret(this.key('gitlab', userId), record);
    }
    return { username: 'oauth2', password: record.accessToken };
  }

  private async gitlabToken(baseUrl: string, params: Record<string, string>): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: string; scopes: string[] }> {
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

  private async gitlabProfile(baseUrl: string, accessToken: string, header: 'Bearer' | 'PRIVATE-TOKEN' = 'Bearer'): Promise<{ login: string; webUrl: string }> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${baseUrl}/api/v4/user`, { headers: { ...(header === 'Bearer' ? { authorization: `Bearer ${accessToken}` } : { 'private-token': accessToken }), accept: 'application/json' }, signal: AbortSignal.timeout(10_000), redirect: 'error' });
    } catch { throw new LinkError(502, 'link_profile', 'GitLab could not be reached to confirm the linked account.'); }
    if (!response.ok) throw new LinkError(502, 'link_profile', `GitLab refused the linked account lookup with HTTP ${response.status}.`);
    let data: any;
    try { data = await response.json(); } catch { throw new LinkError(502, 'link_profile', 'GitLab returned an invalid account response.'); }
    if (typeof data?.username !== 'string' || !/^[A-Za-z0-9._-]{1,255}$/.test(data.username)) throw new LinkError(502, 'link_profile', 'GitLab returned no account name.');
    const webUrl = typeof data.web_url === 'string' && /^https?:\/\//.test(data.web_url) ? data.web_url.slice(0, 500) : `${baseUrl}/${data.username}`;
    return { login: data.username, webUrl };
  }

  private async clickupProfile(apiUrl: string, accessToken: string): Promise<{ login: string }> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${apiUrl}/api/v2/user`, { headers: { authorization: accessToken, accept: 'application/json' }, signal: AbortSignal.timeout(10_000), redirect: 'error' });
    } catch { throw new LinkError(502, 'link_profile', 'ClickUp could not be reached to confirm the linked account.'); }
    if (!response.ok) throw new LinkError(502, 'link_profile', `ClickUp refused the linked account lookup with HTTP ${response.status}.`);
    let data: any;
    try { data = await response.json(); } catch { throw new LinkError(502, 'link_profile', 'ClickUp returned an invalid account response.'); }
    const login = [data?.user?.username, data?.user?.email].find((value): value is string => typeof value === 'string' && value.trim().length > 0);
    if (!login) throw new LinkError(502, 'link_profile', 'ClickUp returned no account name.');
    return { login: login.trim().slice(0, 255) };
  }
}
