import { createServer } from 'node:http';
import { Client, StreamableHTTPClientTransport, UnauthorizedError, type OAuthClientProvider, type OAuthDiscoveryState, type StoredOAuthTokens } from '@modelcontextprotocol/client';
import type { BrowserContext } from 'playwright';
import { signInAtAuthentik, type Authentik, type Person } from './authentik.ts';

/**
 * A native MCP client's sign-in state, as Claude Code keeps it: a pre-registered public client id, a loopback
 * redirect, the PKCE verifier and the tokens. The person signs in in a real browser context of their own.
 */
export class LoopbackSignIn implements OAuthClientProvider {
  readonly clientId: string;
  readonly redirect: string;
  stored?: StoredOAuthTokens;
  authorizations: URL[] = [];
  private verifier?: string;
  private discovery?: OAuthDiscoveryState;
  private expected?: string;

  constructor(clientId: string, redirect: string) { this.clientId = clientId; this.redirect = redirect; }

  get redirectUrl() { return this.redirect; }
  get clientMetadata() { return { client_name: 'Unfold e2e', redirect_uris: [this.redirect], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', application_type: 'native' as const }; }
  state() { this.expected = crypto.randomUUID(); return this.expected; }
  get lastState() { return this.expected; }
  clientInformation() { return { client_id: this.clientId }; }
  tokens() { return this.stored; }
  saveTokens(tokens: StoredOAuthTokens) { this.stored = tokens; }
  redirectToAuthorization(url: URL) { this.authorizations.push(url); }
  saveCodeVerifier(verifier: string) { this.verifier = verifier; }
  codeVerifier() { if (!this.verifier) throw new Error('no code verifier'); return this.verifier; }
  saveDiscoveryState(state: OAuthDiscoveryState) { this.discovery = state; }
  discoveryState() { return this.discovery; }
  invalidateCredentials(scope: string) { if (scope === 'all' || scope === 'tokens') this.stored = undefined; }

  /** The access token the client sends, which the test inspects and replays by hand. */
  get accessToken(): string {
    if (!this.stored?.access_token) throw new Error('not signed in');
    return this.stored.access_token;
  }
}

/** A loopback callback listener, as a native client runs one while the person signs in. */
export async function loopbackCallback() {
  let resolve!: (query: URLSearchParams) => void;
  let next = new Promise<URLSearchParams>(done => { resolve = done; });
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://127.0.0.1');
    if (url.pathname !== '/callback') { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<!doctype html><title>Signed in</title><p>Signed in. You can close this window.</p>');
    const done = resolve;
    next = new Promise<URLSearchParams>(settle => { resolve = settle; });
    done(url.searchParams);
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no address');
  return {
    redirect: `http://127.0.0.1:${address.port}/callback`,
    take() { return next; },
    close: () => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); }),
  };
}

export type Era = 'legacy' | 'modern';

/** What the person was shown at Authentik during the most recent sign-in `connect` ran. */
export let lastAuthentik: { signedIn: boolean; consented: string[] } | undefined;
export type Elicit = (request: { params: { message?: string; requestedSchema?: unknown; mode?: string } }) => Promise<{ action: 'accept' | 'decline' | 'cancel'; content?: Record<string, unknown> }>;

/** One person's MCP client against one server: the SDK client, its sign-in state and the browser it signs in with. */
export type Connection = { client: Client; signIn: LoopbackSignIn; close(): Promise<void> };

/**
 * Connects the official MCP TypeScript client to `url` as `person`. When the server answers 401, the client
 * discovers the authorization server from the protected resource metadata and sends the person to it; the
 * person signs in on Authentik's page in `context`, Authentik redirects to the loopback callback, and the
 * client exchanges the code and connects again. A later call with the same `signIn` reuses its tokens.
 */
export async function connect(options: { url: string; clientId: string; era: Era; authentik: Authentik; person: Person; context: BrowserContext; elicit?: Elicit; signIn?: LoopbackSignIn; callback?: Awaited<ReturnType<typeof loopbackCallback>> }): Promise<Connection> {
  const callback = options.callback ?? await loopbackCallback();
  const signIn = options.signIn ?? new LoopbackSignIn(options.clientId, callback.redirect);
  const make = () => {
    const client = new Client({ name: 'unfold-e2e', version: '1.0.0' }, { capabilities: options.elicit ? { elicitation: { form: {} } } : {}, ...(options.era === 'modern' ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {}) });
    if (options.elicit) client.setRequestHandler('elicitation/create', options.elicit as never);
    return client;
  };
  const endpoint = new URL(options.url);
  const step = (what: string) => { if (process.env.UNFOLD_E2E_VERBOSE) process.stderr.write(`[mcp-e2e] ${options.person.username}: ${what}\n`); };
  let client = make();
  try {
    step('connecting');
    await client.connect(new StreamableHTTPClientTransport(endpoint, { authProvider: signIn }));
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) throw error;
    const authorization = signIn.authorizations.at(-1);
    if (!authorization) throw new Error('the client was refused but never sent the person to sign in');
    step(`sent to ${authorization.origin}${authorization.pathname}`);
    const page = await options.context.newPage();
    const returned = callback.take();
    await page.goto(authorization.href);
    lastAuthentik = await signInAtAuthentik(page, options.authentik, options.person, new RegExp(`^${callback.redirect.replace(/[.]/g, '\\.')}`));
    step(`left Authentik: ${JSON.stringify(lastAuthentik)}`);
    const query = await returned;
    step('callback received');
    await page.close();
    if (query.get('error')) throw Object.assign(new Error(`Authentik refused the authorization: ${query.get('error')}`), { query });
    if (query.get('state') !== signIn.lastState) throw new Error('the callback carries another state');
    const transport = new StreamableHTTPClientTransport(endpoint, { authProvider: signIn });
    await transport.finishAuth(query);
    step('code exchanged');
    client = make();
    await client.connect(new StreamableHTTPClientTransport(endpoint, { authProvider: signIn }));
  }
  step('connected');
  return { client, signIn, close: async () => { await client.close().catch(() => undefined); if (!options.callback) await callback.close(); } };
}
