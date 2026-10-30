import type { AppConfig, RepositoryAccess } from '../types.ts';

/** A person's stored link: the tokens, how they were obtained, and the account they belong to. */
export type LinkRecord = { accessToken: string; refreshToken?: string; expiresAt?: string; verifier?: string; scopes: string[]; login: string; webUrl: string; linkedAt: string; method?: 'oauth' | 'token' };
/** What an adapter is given for one call: the configuration, the fetch to use and its OAuth callback address. */
export type LinkContext = { config: AppConfig; fetch: typeof fetch; redirectUri: string };
/** A token a task source reads with: a Bearer OAuth token, or a personal token sent the provider's own way. */
export type LinkedToken = { token: string; type: 'bearer' | 'private' };
/** Writes one structured log line about a link, never with its token. */
export type LinkLog = (level: 'info' | 'warn', event: string, fields: Record<string, unknown>, message: string) => void;

/** One provider a person links their own account on. Code outside an adapter never names a provider. */
export interface LinkProviderAdapter {
  /** The name in `/api/links/{name}` and in the store. */
  readonly name: string;
  /** The product name for messages and audit records. */
  readonly label: string;
  /** Whether the provider is listed under Linked accounts. */
  listed(config: AppConfig): boolean;
  /** Whether a person can link at all, by OAuth or a pasted token. */
  configured(config: AppConfig): boolean;
  /** Whether an OAuth application is configured. */
  oauth(config: AppConfig): boolean;
  host(config: AppConfig): string;
  /** The origin of the provider's repositories, when a link also clones them. */
  repositoryOrigin?(config: AppConfig): string | undefined;
  authorizeUrl(context: LinkContext, state: string, challenge: string): string;
  exchange(context: LinkContext, code: string, verifier: string): Promise<LinkRecord>;
  paste(context: LinkContext, token: string): Promise<LinkRecord>;
  /** Revokes an OAuth link upstream where the provider allows it, and logs when it cannot. */
  revoke(context: LinkContext, record: LinkRecord, log: LinkLog): Promise<void>;
  token(context: LinkContext, record: LinkRecord, save: (record: LinkRecord) => void): Promise<LinkedToken | undefined>;
  /** Git credentials for a repository on the provider, refreshing an OAuth token that is about to expire. */
  repositoryAccess?(context: LinkContext, repositoryUrl: string, record: LinkRecord | undefined, save: (record: LinkRecord) => void): Promise<RepositoryAccess | undefined>;
}

const adapters = new Map<string, LinkProviderAdapter>();

/** Registers a link provider adapter; a second adapter under the same name is refused. */
export function registerLinkProvider(adapter: LinkProviderAdapter): void {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(adapter.name)) throw new Error(`Link provider names are lowercase slugs: ${adapter.name}`);
  if (adapters.has(adapter.name)) throw new Error(`Link provider ${adapter.name} is already registered`);
  adapters.set(adapter.name, adapter);
}

/** The adapter registered under `name`, or undefined. */
export function findLinkProvider(name: string): LinkProviderAdapter | undefined { return adapters.get(name); }

/** Every registered adapter, in registration order. */
export function linkAdapters(): LinkProviderAdapter[] { return [...adapters.values()]; }
