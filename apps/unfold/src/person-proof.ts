import { actionContext } from './action-records.ts';
import type { PersonGrant, Store } from './store.ts';
import type { AppConfig } from './types.ts';

/** Where Unfold exchanges a person's access token for a Ploeg-audience token (RFC 8693), from `ploeg.personTokens`. */
export type PersonTokenSettings = { tokenUrl: string; clientId: string; clientSecretEnv: string; audience: string };

/** The header that carries a person token next to Unfold's own operator credential (Ploeg ADR-0150). */
export const personTokenHeader = 'X-Ploeg-Person-Token';

/** The tokens the identity provider returned at sign-in or at a refresh. */
export type SignInTokens = { accessToken: string; refreshToken?: string; expiresInSeconds?: number };

/** Refreshes a person's access token at the sign-in provider. */
export type RefreshTokens = (refreshToken: string) => Promise<SignInTokens>;

/**
 * What a credential delegated for one request carries to prove its person, for as long as that credential lives:
 * `request`, the access token `unfold-mcp` over HTTP verified for that request and its facts; `sign_in`, the person's
 * kept sign-in, for the Agents-window chat's tools.
 */
export type DelegatedProof =
  | { source: 'request'; userId: string; accessToken: string; subject: string; expiresAt: number }
  | { source: 'sign_in'; userId: string };

type RequestProof = Extract<DelegatedProof, { source: 'request' }>;

/** Why a person's actions reach Ploeg as asserted instead of proven. */
export type ProofGap = 'no_grant' | 'expired' | 'refused' | 'unreachable' | 'unconfigured' | 'rejected' | 'mismatch';

/** What the Status page tells a person about how Ploeg records their actions. */
export type PersonProofStatus = { state: 'proven' | 'degraded'; gap?: ProofGap; summary: string; since?: string };

const exchangeGrant = 'urn:ietf:params:oauth:grant-type:token-exchange';
const accessTokenType = 'urn:ietf:params:oauth:token-type:access_token';
const earlyMs = 30_000;
const fallbackLifetimeSeconds = 300;
const maxTokenBytes = 8192;
const requestTimeoutMs = 5_000;

const summaries: Record<ProofGap, string> = {
  no_grant: 'This sign-in holds no proof of who you are, so Ploeg records your actions as named by Unfold, not proven. Sign out and sign in with single sign-on to restore the proof.',
  expired: 'Your sign-in’s proof ran out, so Ploeg records your actions as named by Unfold, not proven. Sign out and sign in again to restore it.',
  refused: 'The identity provider no longer vouches for your sign-in, so Ploeg records your actions as named by Unfold, not proven. Sign out and sign in again to restore it.',
  unreachable: 'The identity provider did not answer at your last action, so Ploeg recorded it as named by Unfold, not proven. Unfold tries again at your next action.',
  unconfigured: 'Unfold cannot ask the identity provider for proof of who you are, so Ploeg records your actions as named by Unfold, not proven. An administrator should check the person-token settings.',
  rejected: 'Ploeg did not accept the proof Unfold sent for your last action, so it recorded the action as named by Unfold, not proven. An administrator should check the person-token settings of Unfold and Ploeg.',
  mismatch: 'The identity provider returned proof for someone other than you, so Unfold did not send it and Ploeg recorded your action as named by Unfold. An administrator should check the token exchange settings.',
};

function jwtShaped(value: unknown): value is string {
  return typeof value === 'string' && value.length <= maxTokenBytes && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(value);
}

function claimsOf(token: string): Record<string, unknown> {
  try { const value = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); return value && typeof value === 'object' ? value : {}; } catch { return {}; }
}

/** When a token stops working: its `exp` when it is a JWT, otherwise `expiresInSeconds` from now, otherwise five minutes. */
export function tokenExpiry(token: string, expiresInSeconds: number | undefined, now: number): number {
  const exp = jwtShaped(token) ? claimsOf(token).exp : undefined;
  const fromResponse = typeof expiresInSeconds === 'number' && Number.isFinite(expiresInSeconds) && expiresInSeconds > 0 ? now + expiresInSeconds * 1000 : undefined;
  const fromToken = typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : undefined;
  const candidates = [fromResponse, fromToken].filter((value): value is number => value !== undefined);
  return candidates.length ? Math.min(...candidates) : now + fallbackLifetimeSeconds * 1000;
}

class ExchangeFailure extends Error {
  readonly gap: ProofGap;
  constructor(gap: ProofGap) { super(gap); this.gap = gap; }
}

/**
 * Proves to Ploeg which person an operator change is for. At single sign-on Unfold keeps the person's access token
 * (and refresh token) encrypted in its store, bound to that login; before a Ploeg change made for that person it
 * exchanges the access token at the identity provider for a short-lived Ploeg-audience token and sends it as
 * `X-Ploeg-Person-Token` (RFC-0011 section 2). Whenever no token can be had, the change goes out as before, with the
 * person only named in headers, and the Status page says so. Tokens never reach logs, errors or the browser.
 */
export class PersonProof {
  private readonly settings: PersonTokenSettings;
  private readonly store: Store;
  private readonly refresh: RefreshTokens | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly cache = new Map<string, { token: string; until: number }>();
  private readonly inflight = new Map<string, Promise<string | undefined>>();
  private readonly gaps = new Map<string, { gap: ProofGap; at: number }>();
  private readonly carriedTokens = new WeakMap<RequestProof, Promise<string | undefined>>();

  constructor(settings: PersonTokenSettings, store: Store, options: { refresh?: RefreshTokens; fetch?: typeof fetch; now?: () => number } = {}) {
    this.settings = settings;
    this.store = store;
    this.refresh = options.refresh;
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }

  /** Keeps the tokens a person's single sign-on returned, encrypted and bound to the login `signIn` identifies. */
  remember(signIn: string, userId: string, subject: string, tokens: SignInTokens): void {
    if (!/^[!-~]{1,8192}$/.test(tokens.accessToken)) return;
    const now = this.now();
    this.store.setPersonGrant(signIn, { userId, subject, accessToken: tokens.accessToken, accessExpiresAt: tokenExpiry(tokens.accessToken, tokens.expiresInSeconds, now), ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}) });
    this.cache.delete(signIn);
    this.gaps.delete(signIn);
  }

  /** Drops everything held for the login `signIn` identifies; the store drops the grant with the login itself. */
  forget(signIn: string): void {
    this.cache.delete(signIn);
    this.gaps.delete(signIn);
    this.store.deletePersonGrant(signIn);
  }

  /**
   * Sends a Ploeg operator change for `person`: with their person token when one can be had and `actingUser` is the
   * same person, otherwise as before. A request through a delegated credential uses only the proof that credential
   * carries for that same person: `unfold-mcp` over HTTP exchanges the access token of that request, the chat uses the
   * person's kept sign-in. A change Ploeg refuses for the person token alone (HTTP 401) is sent once more without it;
   * Ploeg refuses such a request before acting on it, so the retry never repeats work.
   */
  async send(person: string, actingUser: string | undefined, call: (headers: Record<string, string>) => Promise<Response>): Promise<Response> {
    if (actingUser !== undefined && actingUser !== person) return call({});
    const context = actionContext.getStore();
    if (context?.scope === 'mcp') {
      const carried = context.proof;
      if (carried?.userId !== person) return call({});
      if (carried.source === 'request') return this.sendWith(`mcp:${person}`, () => this.carried(carried), () => this.carriedTokens.delete(carried), call);
    }
    const signIn = this.loginFor(person, context?.signIn);
    if (!signIn) return call({});
    return this.sendWith(signIn, () => this.token(signIn), () => this.cache.delete(signIn), call);
  }

  private async sendWith(key: string, token: () => Promise<string | undefined>, drop: () => void, call: (headers: Record<string, string>) => Promise<Response>): Promise<Response> {
    const value = await token();
    if (!value) return call({});
    const response = await call({ [personTokenHeader]: value });
    if (response.status !== 401) return response;
    await response.body?.cancel().catch(() => undefined);
    drop();
    this.note(key, 'rejected');
    return call({});
  }

  /**
   * What the Status page says to a person about how Ploeg records their actions: for the browser login `browserSignIn`
   * when they read it in a browser, otherwise for their newest live login.
   */
  status(userId: string, browserSignIn?: string): PersonProofStatus {
    const signIn = browserSignIn ?? this.store.personGrantLogins(userId)[0];
    const grant = signIn ? this.store.personGrant(signIn) : undefined;
    if (!signIn || !grant || grant.userId !== userId) return { state: 'degraded', gap: 'no_grant', summary: summaries.no_grant };
    const gap = this.gaps.get(signIn);
    if (gap) return { state: 'degraded', gap: gap.gap, summary: summaries[gap.gap], since: new Date(gap.at).toISOString() };
    if (!grant.refreshToken && grant.accessExpiresAt - earlyMs <= this.now()) return { state: 'degraded', gap: 'expired', summary: summaries.expired, since: new Date(grant.accessExpiresAt).toISOString() };
    return { state: 'proven', summary: 'Ploeg records what you do here as proven by your sign-in.' };
  }

  private loginFor(person: string, requestSignIn: string | undefined): string | undefined {
    if (requestSignIn) {
      const own = this.store.personGrant(requestSignIn);
      if (own?.userId === person) return requestSignIn;
    }
    return this.store.personGrantLogins(person)[0];
  }

  private carried(proof: RequestProof): Promise<string | undefined> {
    let work = this.carriedTokens.get(proof);
    if (!work) {
      work = this.exchangeCarried(proof);
      this.carriedTokens.set(proof, work);
    }
    return work;
  }

  private async exchangeCarried(proof: RequestProof): Promise<string | undefined> {
    const key = `mcp:${proof.userId}`;
    try {
      if (proof.expiresAt <= this.now()) throw new ExchangeFailure('expired');
      const issued = await this.exchange(proof);
      this.gaps.delete(key);
      return issued.token;
    } catch (error) {
      this.note(key, error instanceof ExchangeFailure ? error.gap : 'unreachable');
      return undefined;
    }
  }

  private async token(signIn: string): Promise<string | undefined> {
    const cached = this.cache.get(signIn);
    if (cached && cached.until > this.now() && this.store.getLogin(signIn)) return cached.token;
    this.cache.delete(signIn);
    const running = this.inflight.get(signIn);
    if (running) return running;
    const work = this.mint(signIn).finally(() => this.inflight.delete(signIn));
    this.inflight.set(signIn, work);
    return work;
  }

  private async mint(signIn: string): Promise<string | undefined> {
    let grant = this.store.personGrant(signIn);
    if (!grant) return undefined;
    let refreshed = false;
    try {
      if (grant.accessExpiresAt - earlyMs <= this.now()) {
        grant = await this.renew(signIn, grant);
        refreshed = true;
      }
      let issued: { token: string; until: number };
      try { issued = await this.exchange(grant); }
      catch (error) {
        if (!(error instanceof ExchangeFailure) || error.gap !== 'refused' || refreshed || !grant.refreshToken) throw error;
        grant = await this.renew(signIn, grant);
        issued = await this.exchange(grant);
      }
      if (issued.until > this.now()) this.cache.set(signIn, issued);
      this.gaps.delete(signIn);
      return issued.token;
    } catch (error) {
      this.note(signIn, error instanceof ExchangeFailure ? error.gap : 'unreachable');
      return undefined;
    }
  }

  private async renew(signIn: string, grant: PersonGrant): Promise<PersonGrant> {
    if (!grant.refreshToken || !this.refresh) throw new ExchangeFailure('expired');
    let tokens: SignInTokens;
    try { tokens = await this.refresh(grant.refreshToken); }
    catch (error) { throw new ExchangeFailure((error as { status?: number })?.status === 400 || (error as { status?: number })?.status === 401 ? 'expired' : 'unreachable'); }
    const renewed: PersonGrant = { ...grant, accessToken: tokens.accessToken, accessExpiresAt: tokenExpiry(tokens.accessToken, tokens.expiresInSeconds, this.now()), ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}) };
    if (!this.store.getLogin(signIn)) throw new ExchangeFailure('expired');
    this.store.setPersonGrant(signIn, renewed);
    return renewed;
  }

  private async exchange(grant: { accessToken: string; subject: string }): Promise<{ token: string; until: number }> {
    const secret = process.env[this.settings.clientSecretEnv];
    if (!secret) throw new ExchangeFailure('unconfigured');
    const body = new URLSearchParams({ grant_type: exchangeGrant, client_id: this.settings.clientId, client_secret: secret, subject_token: grant.accessToken, subject_token_type: accessTokenType, audience: this.settings.audience });
    let response: Response;
    try { response = await this.fetchImpl(this.settings.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: body.toString(), signal: AbortSignal.timeout(requestTimeoutMs), redirect: 'error' }); }
    catch { throw new ExchangeFailure('unreachable'); }
    if (response.status === 400 || response.status === 401 || response.status === 403) { await response.body?.cancel().catch(() => undefined); throw new ExchangeFailure('refused'); }
    if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw new ExchangeFailure('unreachable'); }
    let data: Record<string, unknown>;
    try { data = await response.json() as Record<string, unknown>; } catch { throw new ExchangeFailure('unreachable'); }
    const token = data?.access_token;
    if (!jwtShaped(token)) throw new ExchangeFailure('unreachable');
    if (claimsOf(token).sub !== grant.subject) throw new ExchangeFailure('mismatch');
    const now = this.now();
    return { token, until: tokenExpiry(token, typeof data.expires_in === 'number' ? data.expires_in : undefined, now) - earlyMs };
  }

  private note(signIn: string, gap: ProofGap): void {
    const known = this.gaps.get(signIn);
    if (known?.gap !== gap) {
      this.gaps.set(signIn, { gap, at: this.now() });
      console.error(JSON.stringify({ level: 'warn', event: 'person_proof.degraded', gap }));
    }
  }
}

/** The person-proof service a configuration asks for, or undefined when `ploeg.personTokens` or single sign-on is absent. */
export function personProof(config: AppConfig, store: Store, refresh?: RefreshTokens): PersonProof | undefined {
  const settings = config.ploeg?.personTokens;
  return settings && config.auth.oidc && !config.ploeg?.demo ? new PersonProof(settings, store, { refresh }) : undefined;
}
