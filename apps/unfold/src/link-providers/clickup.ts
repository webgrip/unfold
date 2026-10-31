import type { AppConfig } from '../types.ts';
import { RuntimeFailure } from '../failures.ts';
import { findTaskProvider } from '../task-providers/index.ts';
import type { LinkContext, LinkProviderAdapter } from './registry.ts';
import { LinkError } from './shared.ts';

const settings = (config: AppConfig) => config.links?.clickup;
const apiUrl = (config: AppConfig) => settings(config)?.apiUrl ?? 'https://api.clickup.com';
const appUrl = (config: AppConfig) => settings(config)?.appUrl ?? 'https://app.clickup.com';

async function profile(context: LinkContext, url: string, accessToken: string): Promise<{ login: string }> {
  let response: Response;
  try {
    response = await context.fetch(`${url}/api/v2/user`, { headers: { authorization: accessToken, accept: 'application/json' }, signal: AbortSignal.timeout(10_000), redirect: 'error' });
  } catch { throw new LinkError(502, 'link_profile', 'ClickUp could not be reached to confirm the linked account.'); }
  if (!response.ok) throw new LinkError(502, 'link_profile', `ClickUp refused the linked account lookup with HTTP ${response.status}.`);
  let data: any;
  try { data = await response.json(); } catch { throw new LinkError(502, 'link_profile', 'ClickUp returned an invalid account response.'); }
  const login = [data?.user?.username, data?.user?.email].find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  if (!login) throw new LinkError(502, 'link_profile', 'ClickUp returned no account name.');
  return { login: login.trim().slice(0, 255) };
}

/** ClickUp links: OAuth with PKCE when an application and its secret are configured, otherwise a pasted personal token. ClickUp has no revocation endpoint. Listed whenever a task source reads ClickUp with linked accounts. */
export const clickupLinks: LinkProviderAdapter = {
  name: 'clickup',
  label: 'ClickUp',
  listed: config => Boolean(settings(config)) || (config.taskSources ?? []).some(source => findTaskProvider(source.provider)?.linkedAccount === 'clickup'),
  configured: () => true,
  oauth: config => Boolean(settings(config)?.clientId && settings(config)?.clientSecret),
  host: config => new URL(appUrl(config)).host,
  trackerApiRoot: config => `${apiUrl(config).replace(/\/+$/, '')}/api/v2`,
  authorizeUrl(context, state, challenge) {
    const { clientId, appUrl: app } = settings(context.config)!;
    const url = new URL(`${app}/api`);
    url.searchParams.set('client_id', clientId!);
    url.searchParams.set('redirect_uri', context.redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  },
  async exchange(context, code, verifier) {
    const { clientId, clientSecret, apiUrl: api, appUrl: app } = settings(context.config)!;
    const url = new URL(`${api}/api/v2/oauth/token`);
    const body = JSON.stringify({ client_id: clientId!, client_secret: clientSecret!, code, code_verifier: verifier });
    let response: Response;
    try { response = await context.fetch(url, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(10_000), redirect: 'error' }); }
    catch { throw new RuntimeFailure('connectivity', 'workspace', 'not_submitted', undefined, 'ClickUp could not be reached to exchange the link code.'); }
    if (!response.ok) throw new RuntimeFailure(response.status >= 500 ? 'connectivity' : 'workspace_setup', 'workspace', 'not_submitted', response.status, `The ClickUp OAuth exchange answered HTTP ${response.status}`);
    let data: any;
    try { data = await response.json(); } catch { throw new RuntimeFailure('workspace_setup', 'workspace', 'not_submitted', undefined, 'ClickUp returned an invalid token response.'); }
    if (typeof data?.access_token !== 'string' || !data.access_token) throw new RuntimeFailure('workspace_setup', 'workspace', 'not_submitted', undefined, 'ClickUp returned no access token.');
    const account = await profile(context, api, data.access_token);
    return { accessToken: data.access_token, scopes: [], login: account.login, webUrl: app, linkedAt: new Date().toISOString(), method: 'oauth' };
  },
  async paste(context, token) {
    const account = await profile(context, apiUrl(context.config), token);
    return { accessToken: token, scopes: [], login: account.login, webUrl: appUrl(context.config), linkedAt: new Date().toISOString(), method: 'token' };
  },
  async revoke(_context, _record, log) {
    log('info', 'link.revoke_unsupported', {}, 'ClickUp has no token revocation endpoint; the token stays valid until the person removes the app at the provider.');
  },
  token: async (_context, record) => ({ token: record.accessToken, type: 'private' }),
};
