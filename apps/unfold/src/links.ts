import { createHash, randomBytes } from 'node:crypto';
import type { AppConfig, RepositoryAccess } from './types.ts';
import type { Store } from './store.ts';
import { findLinkProvider, linkAdapters, type LinkContext, type LinkProviderAdapter, type LinkRecord } from './link-providers/index.ts';
import { LinkError } from './link-providers/shared.ts';

export { LinkError } from './link-providers/shared.ts';
/** The name a link provider adapter registered under, in `src/link-providers/`. */
export type LinkProvider = string;
export type PublicLink = { provider: LinkProvider; host: string; configured: boolean; oauth: boolean; linked: boolean; method?: 'oauth' | 'token'; login?: string; webUrl?: string; scopes?: string[]; linkedAt?: string; expiresAt?: string };
type Pending = { provider: LinkProvider; userId: string; verifier: string; createdAt: number; browserBinding: string };

/** The names of the registered link providers, in registration order. */
export const linkProviders = (): LinkProvider[] => linkAdapters().map(adapter => adapter.name);
/** Whether a link provider is registered under `name`. */
export const isLinkProvider = (name: string): boolean => Boolean(findLinkProvider(name));
/** The product name of a link provider, for messages and audit records. */
export const linkProviderLabel = (name: string): string => findLinkProvider(name)?.label ?? name;
const pendingTtlMs = 10 * 60_000;
const maxPending = 1000;

function base64url(bytes: Buffer): string { return bytes.toString('base64url'); }

function adapter(provider: LinkProvider): LinkProviderAdapter {
  const found = findLinkProvider(provider);
  if (!found) throw new LinkError(404, 'link_unknown', 'This workbench links no such provider.');
  return found;
}

export class Links {
  private readonly store: Store;
  private readonly config: AppConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly pending = new Map<string, Pending>();

  constructor(store: Store, config: AppConfig, fetchImpl: typeof fetch = fetch) { this.store = store; this.config = config; this.fetchImpl = fetchImpl; }

  private context(provider: LinkProvider): LinkContext { return { config: this.config, fetch: this.fetchImpl, redirectUri: this.redirectUri(provider) }; }
  private key(provider: LinkProvider, userId: string): string { return `link:${provider}:${userId}`; }
  private record(provider: LinkProvider, userId: string): LinkRecord | undefined { return this.store.getSecret<LinkRecord>(this.key(provider, userId)); }
  private saver(provider: LinkProvider, userId: string): (record: LinkRecord) => void { return record => this.store.setSecret(this.key(provider, userId), record); }

  redirectUri(provider: LinkProvider): string { return `${this.config.baseUrl ?? `http://${this.config.host}:${this.config.port}`}/api/links/${provider}/callback`; }

  describe(userId: string, provider: LinkProvider = linkProviders()[0]): PublicLink {
    const links = adapter(provider);
    const record = this.record(provider, userId);
    if (!record) return { provider, host: links.host(this.config), configured: links.configured(this.config), oauth: links.oauth(this.config), linked: false };
    return { provider, host: links.host(this.config), configured: true, oauth: links.oauth(this.config), linked: true, method: record.method ?? 'oauth', login: record.login, webUrl: record.webUrl, scopes: record.scopes, linkedAt: record.linkedAt, expiresAt: record.expiresAt };
  }

  describeAll(userId: string): PublicLink[] { return linkAdapters().filter(links => links.listed(this.config)).map(links => this.describe(userId, links.name)); }

  describeFor(userId: string, repositoryUrl: string): PublicLink | undefined {
    let origin: string;
    try { origin = new URL(repositoryUrl).origin; } catch { return undefined; }
    const links = linkAdapters().find(entry => { try { return entry.repositoryOrigin?.(this.config) === origin; } catch { return false; } });
    return links ? this.describe(userId, links.name) : undefined;
  }

  begin(provider: LinkProvider, userId: string, browserBinding: string): string {
    const links = adapter(provider);
    if (!links.oauth(this.config)) throw new LinkError(409, 'link_unconfigured', `${links.label} has no OAuth application on this workbench; paste a personal token instead.`);
    if (!browserBinding) throw new LinkError(400, 'link_state', 'Start linking from this browser.');
    const now = Date.now();
    for (const [state, item] of this.pending) if (now - item.createdAt > pendingTtlMs) this.pending.delete(state);
    if (this.pending.size >= maxPending) throw new LinkError(429, 'link_busy', 'Too many link attempts are waiting. Try again in a few minutes.');
    const verifier = base64url(randomBytes(48));
    const state = base64url(randomBytes(24));
    this.pending.set(state, { provider, userId, verifier, createdAt: now, browserBinding });
    return links.authorizeUrl(this.context(provider), state, base64url(createHash('sha256').update(verifier).digest()));
  }

  async complete(provider: LinkProvider, code: string, state: string, browserBinding: string): Promise<{ userId: string; link: PublicLink }> {
    const links = adapter(provider);
    if (!links.oauth(this.config)) throw new LinkError(409, 'link_unconfigured', 'This link has no OAuth application on this workbench.');
    const pending = this.pending.get(state);
    if (!browserBinding || pending?.browserBinding !== browserBinding) throw new LinkError(400, 'link_state', 'The link attempt was not started in this browser. Start again.');
    if (pending) this.pending.delete(state);
    if (!pending || pending.provider !== provider || Date.now() - pending.createdAt > pendingTtlMs) throw new LinkError(400, 'link_state', 'The link attempt expired or was not started here. Start again.');
    if (!/^[A-Za-z0-9._~-]{1,512}$/.test(code)) throw new LinkError(400, 'link_code', 'The provider returned an invalid authorization code.');
    const record = await links.exchange(this.context(provider), code, pending.verifier);
    this.store.setSecret(this.key(provider, pending.userId), record);
    return { userId: pending.userId, link: this.describe(pending.userId, provider) };
  }

  async paste(provider: LinkProvider, userId: string, token: string): Promise<PublicLink> {
    if (typeof token !== 'string' || !token.trim() || token.length > 4096 || /[^\x21-\x7e]/.test(token.trim())) throw new LinkError(400, 'link_token', 'Paste the token exactly as the provider shows it.');
    const record = await adapter(provider).paste(this.context(provider), token.trim());
    this.store.setSecret(this.key(provider, userId), record);
    return this.describe(userId, provider);
  }

  /**
   * Forgets a person's link and revokes its tokens upstream where the provider allows it. A token the provider keeps
   * valid, because the person pasted it or the provider has no revocation endpoint, and a revocation that fails are
   * logged without the token, so an operator can tell the person to remove it at the provider.
   */
  async revoke(provider: LinkProvider, userId: string): Promise<void> {
    const links = adapter(provider);
    const record = this.record(provider, userId);
    this.store.deleteSecret(this.key(provider, userId));
    if (!record) return;
    const log = (level: 'info' | 'warn', event: string, fields: Record<string, unknown>, message: string) => console.error(JSON.stringify({ level, event, provider, userId, method: record.method ?? 'oauth', ...fields, message }));
    if (record.method === 'token') { log('info', 'link.revoke_skipped', {}, 'The person pasted this token; it stays valid at the provider until they revoke it there.'); return; }
    await links.revoke(this.context(provider), record, log);
  }

  async token(userId: string, provider: LinkProvider): Promise<{ token: string; type: 'bearer' | 'private' } | undefined> {
    const links = findLinkProvider(provider);
    const record = links ? this.record(provider, userId) : undefined;
    return links && record ? links.token(this.context(provider), record, this.saver(provider, userId)) : undefined;
  }

  async access(userId: string, repositoryUrl: string): Promise<RepositoryAccess | undefined> {
    for (const links of linkAdapters()) {
      if (!links.repositoryAccess) continue;
      const access = await links.repositoryAccess(this.context(links.name), repositoryUrl, this.record(links.name, userId), this.saver(links.name, userId));
      if (access) return access;
    }
    return undefined;
  }
}
