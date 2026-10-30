import type { AppConfig } from '../types.ts';
import { RuntimeFailure } from '../failures.ts';
import type { LinkContext, LinkProviderAdapter, LinkRecord } from './registry.ts';
import { LinkError } from './shared.ts';

const refreshWindowMs = 5 * 60_000;
const settings = (config: AppConfig) => config.links?.gitlab;
const baseUrl = (config: AppConfig) => settings(config)?.baseUrl ?? 'https://gitlab.com';

async function exchangeToken(context: LinkContext, url: string, params: Record<string, string>): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: string; scopes: string[] }> {
  let response: Response;
  try {
    response = await context.fetch(`${url}/oauth/token`, {
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

async function profile(context: LinkContext, url: string, accessToken: string, header: 'Bearer' | 'PRIVATE-TOKEN' = 'Bearer'): Promise<{ login: string; webUrl: string }> {
  let response: Response;
  try {
    response = await context.fetch(`${url}/api/v4/user`, { headers: { ...(header === 'Bearer' ? { authorization: `Bearer ${accessToken}` } : { 'private-token': accessToken }), accept: 'application/json' }, signal: AbortSignal.timeout(10_000), redirect: 'error' });
  } catch { throw new LinkError(502, 'link_profile', 'GitLab could not be reached to confirm the linked account.'); }
  if (!response.ok) throw new LinkError(502, 'link_profile', `GitLab refused the linked account lookup with HTTP ${response.status}.`);
  let data: any;
  try { data = await response.json(); } catch { throw new LinkError(502, 'link_profile', 'GitLab returned an invalid account response.'); }
  if (typeof data?.username !== 'string' || !/^[A-Za-z0-9._-]{1,255}$/.test(data.username)) throw new LinkError(502, 'link_profile', 'GitLab returned no account name.');
  const webUrl = typeof data.web_url === 'string' && /^https?:\/\//.test(data.web_url) ? data.web_url.slice(0, 500) : `${url}/${data.username}`;
  return { login: data.username, webUrl };
}

/** GitLab links: OAuth with PKCE when an application is configured, otherwise a pasted personal token. A link also clones private repositories on the GitLab host and refreshes an OAuth token five minutes before it expires. */
export const gitlabLinks: LinkProviderAdapter = {
  name: 'gitlab',
  label: 'GitLab',
  listed: config => Boolean(settings(config)),
  configured: config => Boolean(settings(config)?.clientId) || Boolean(settings(config)),
  oauth: config => Boolean(settings(config)?.clientId),
  host: config => new URL(baseUrl(config)).host,
  repositoryOrigin: config => { const configured = settings(config); return configured ? new URL(configured.baseUrl).origin : undefined; },
  authorizeUrl(context, state, challenge) {
    const { baseUrl: url, clientId, scopes } = settings(context.config)!;
    const authorize = new URL(`${url}/oauth/authorize`);
    authorize.searchParams.set('client_id', clientId!);
    authorize.searchParams.set('redirect_uri', context.redirectUri);
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('state', state);
    authorize.searchParams.set('scope', scopes.join(' '));
    authorize.searchParams.set('code_challenge', challenge);
    authorize.searchParams.set('code_challenge_method', 'S256');
    return authorize.toString();
  },
  async exchange(context, code, verifier): Promise<LinkRecord> {
    const { baseUrl: url, clientId } = settings(context.config)!;
    const token = await exchangeToken(context, url, { client_id: clientId!, grant_type: 'authorization_code', code, redirect_uri: context.redirectUri, code_verifier: verifier });
    const account = await profile(context, url, token.accessToken);
    return { ...token, verifier, login: account.login, webUrl: account.webUrl, linkedAt: new Date().toISOString(), method: 'oauth' };
  },
  async paste(context, token) {
    const account = await profile(context, baseUrl(context.config), token, 'PRIVATE-TOKEN');
    return { accessToken: token, scopes: [], login: account.login, webUrl: account.webUrl, linkedAt: new Date().toISOString(), method: 'token' };
  },
  async revoke(context, record, log) {
    const configured = settings(context.config);
    if (!configured?.clientId) { log('info', 'link.revoke_unsupported', {}, 'GitLab has no OAuth application configured; the token stays valid until the person removes the app at the provider.'); return; }
    const { baseUrl: url, clientId } = configured;
    for (const [kind, token] of [['access', record.accessToken], ['refresh', record.refreshToken]] as const) {
      if (!token) continue;
      let status: number | undefined;
      let reason: string | undefined;
      try {
        const response = await context.fetch(`${url}/oauth/revoke`, {
          method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ client_id: clientId, token }), signal: AbortSignal.timeout(10_000), redirect: 'error',
        });
        await response.body?.cancel().catch(() => {});
        if (!response.ok) status = response.status;
      } catch (error) { reason = (error as { cause?: { code?: string } })?.cause?.code ?? (error as Error)?.name ?? 'error'; }
      if (status !== undefined || reason !== undefined) log('warn', 'link.revoke_failed', { token: kind, ...(status !== undefined ? { status } : { reason }) }, `GitLab did not confirm revoking the ${kind} token; it may stay valid until it expires.`);
    }
  },
  async token(context, record, save) {
    if (record.method === 'token') return { token: record.accessToken, type: 'private' };
    const access = await gitlabLinks.repositoryAccess!(context, baseUrl(context.config), record, save);
    return access ? { token: access.password, type: 'bearer' } : undefined;
  },
  async repositoryAccess(context, repositoryUrl, stored, save) {
    const configured = settings(context.config) ?? { baseUrl: 'https://gitlab.com', clientId: undefined, scopes: [] };
    let origin: string;
    try { origin = new URL(repositoryUrl).origin; } catch { return undefined; }
    if (origin !== new URL(configured.baseUrl).origin) return undefined;
    let record = stored;
    if (!record) return undefined;
    if (record.method === 'token') return { username: 'oauth2', password: record.accessToken };
    if (!configured.clientId) return undefined;
    if (record.expiresAt && Date.parse(record.expiresAt) - Date.now() < refreshWindowMs) {
      if (!record.refreshToken) throw new RuntimeFailure('workspace_setup', 'workspace', 'not_submitted', undefined, 'The GitLab link expired and cannot be refreshed. Link GitLab again.');
      const refreshed = await exchangeToken(context, configured.baseUrl, { client_id: configured.clientId, grant_type: 'refresh_token', refresh_token: record.refreshToken, redirect_uri: context.redirectUri, code_verifier: record.verifier ?? '' });
      record = { ...record, ...refreshed };
      save(record);
    }
    return { username: 'oauth2', password: record.accessToken };
  },
};
