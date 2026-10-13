import { createHash } from 'node:crypto';
import type { FlagContext, FlagErrorCode, FlagEvaluation, FlagProvider, FlagReason, FlagResolution, FlagValue, OfrepSettings } from './flags.ts';

/** The OFREP version this client and server follow (open-feature/protocol, service/openapi.yaml). */
export const ofrepVersion = '0.4.0';
const ofrepReasons = new Set(['STATIC', 'TARGETING_MATCH', 'SPLIT', 'DISABLED', 'UNKNOWN', 'DEFAULT', 'CACHED', 'ERROR']);
const ofrepErrors = new Set(['PARSE_ERROR', 'TARGETING_KEY_MISSING', 'INVALID_CONTEXT', 'GENERAL', 'FLAG_NOT_FOUND', 'TYPE_MISMATCH']);

type Bulk = { flags: Map<string, Record<string, unknown>>; etag: string | null; at: number };

const typeOf = (value: unknown) => typeof value === 'boolean' ? 'boolean' : typeof value === 'string' ? 'string' : typeof value === 'number' ? 'number' : 'object';

/** A stable key for an evaluation context: its JSON with sorted keys. */
export function contextKey(context: FlagContext): string {
  const sort = (value: unknown): unknown => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort((value as Record<string, unknown>)[key])])) : value;
  return JSON.stringify(sort(context));
}

/**
 * A remote flag provider that speaks OFREP, the OpenFeature Remote Evaluation Protocol, so any OFREP service (flagd,
 * Flipt, GO Feature Flag, the ConfigCat proxy) can answer Unfold's flags. It asks the bulk endpoint once per context and
 * keeps the answer for `cacheMs`, revalidating with `If-None-Match`; a 304 keeps the cache. A 401 or 403 stops it until
 * the process restarts, a 429 waits for `Retry-After`, and every failure resolves as ERROR so the next provider can
 * answer under the first-successful strategy. Credentials come from the environment variables the settings name.
 */
export class OfrepProvider implements FlagProvider {
  readonly metadata: { name: string };
  private readonly settings: OfrepSettings;
  private readonly fetcher: typeof fetch;
  private readonly log: (line: string) => void;
  private readonly now: () => Date;
  private readonly cache = new Map<string, Bulk>();
  private readonly inflight = new Map<string, Promise<Bulk>>();
  private fatal = '';
  private lastError = '';
  private retryAt = 0;

  constructor(settings: OfrepSettings, { fetcher = fetch, log = (line: string) => console.error(line), now = () => new Date() }: { fetcher?: typeof fetch; log?: (line: string) => void; now?: () => Date } = {}) {
    this.settings = settings;
    this.metadata = { name: settings.name };
    this.fetcher = fetcher;
    this.log = log;
    this.now = now;
  }

  status() { return { name: this.settings.name, ready: !this.fatal && !this.lastError, error: this.fatal || this.lastError }; }

  close(): void { this.cache.clear(); }

  private headers(cached: Bulk | undefined): Record<string, string> {
    const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
    const apiKey = this.settings.apiKeyEnv ? process.env[this.settings.apiKeyEnv] : undefined;
    const token = this.settings.tokenEnv ? process.env[this.settings.tokenEnv] : undefined;
    if (apiKey) headers['x-api-key'] = apiKey;
    if (token) headers.authorization = `Bearer ${token}`;
    if (cached?.etag) headers['if-none-match'] = cached.etag;
    return headers;
  }

  private async fetchBulk(key: string, context: FlagContext, cached: Bulk | undefined): Promise<Bulk> {
    const response = await this.fetcher(`${this.settings.url}/ofrep/v1/evaluate/flags`, { method: 'POST', headers: this.headers(cached), body: JSON.stringify({ context }), signal: AbortSignal.timeout(this.settings.timeoutMs) });
    const at = this.now().getTime();
    if (response.status === 304 && cached) { const fresh = { ...cached, at }; this.cache.set(key, fresh); return fresh; }
    if (response.status === 401 || response.status === 403) {
      this.fatal = `${this.settings.name} refused the credentials (${response.status}); fix them and restart Unfold`;
      this.log(JSON.stringify({ level: 'error', event: 'flag.provider_refused', provider: this.settings.name, status: response.status }));
      throw new Error(this.fatal);
    }
    if (response.status === 429) {
      const after = response.headers.get('retry-after') ?? '';
      const seconds = Number(after);
      this.retryAt = Number.isFinite(seconds) && after !== '' ? at + seconds * 1000 : Number.isFinite(Date.parse(after)) ? Date.parse(after) : at + 60_000;
      throw new Error(`${this.settings.name} asked Unfold to wait (429)`);
    }
    if (!response.ok) throw new Error(`${this.settings.name} answered ${response.status}`);
    const body = await response.json() as { flags?: unknown };
    if (!Array.isArray(body.flags)) throw new Error(`${this.settings.name} sent a bulk answer without flags`);
    const flags = new Map<string, Record<string, unknown>>();
    for (const entry of body.flags) if (entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).key === 'string') flags.set((entry as Record<string, string>).key, entry as Record<string, unknown>);
    const bulk = { flags, etag: response.headers.get('etag'), at };
    this.cache.set(key, bulk);
    if (this.cache.size > 5000) this.cache.delete(this.cache.keys().next().value!);
    return bulk;
  }

  private async bulk(context: FlagContext): Promise<Bulk> {
    if (this.fatal) throw new Error(this.fatal);
    const key = contextKey(context);
    const cached = this.cache.get(key);
    const now = this.now().getTime();
    if (cached && now - cached.at < this.settings.cacheMs) return cached;
    if (now < this.retryAt) { if (cached) return cached; throw new Error(`${this.settings.name} asked Unfold to wait (429)`); }
    const running = this.inflight.get(key);
    if (running) return running;
    const request = this.fetchBulk(key, context, cached).then(result => { this.lastError = ''; return result; }, error => { this.lastError = error instanceof Error ? error.message : String(error); if (cached) return cached; throw error; }).finally(() => this.inflight.delete(key));
    this.inflight.set(key, request);
    return request;
  }

  private async resolve<T extends FlagValue>(flagKey: string, defaultValue: T, context: FlagContext): Promise<FlagResolution<T>> {
    let bulk: Bulk;
    try { bulk = await this.bulk(context); }
    catch (error) { return { value: defaultValue, reason: 'ERROR', errorCode: 'GENERAL', errorMessage: error instanceof Error ? error.message : String(error), flagMetadata: {} }; }
    const entry = bulk.flags.get(flagKey);
    if (!entry) return { value: defaultValue, reason: 'ERROR', errorCode: 'FLAG_NOT_FOUND', errorMessage: `${this.settings.name} does not know ${flagKey}`, flagMetadata: {} };
    const metadata = entry.metadata && typeof entry.metadata === 'object' ? Object.fromEntries(Object.entries(entry.metadata as Record<string, unknown>).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))) as Record<string, string | number | boolean> : {};
    if (typeof entry.errorCode === 'string') return { value: defaultValue, reason: 'ERROR', errorCode: (ofrepErrors.has(entry.errorCode) ? entry.errorCode : 'GENERAL') as FlagErrorCode, errorMessage: typeof entry.errorDetails === 'string' ? entry.errorDetails : undefined, flagMetadata: metadata };
    const reason = (typeof entry.reason === 'string' && ofrepReasons.has(entry.reason) ? (entry.reason === 'UNKNOWN' || entry.reason === 'CACHED' ? 'STATIC' : entry.reason) : 'STATIC') as FlagReason;
    if (!('value' in entry) || entry.value === undefined || entry.value === null) return { value: defaultValue, reason: reason === 'DISABLED' ? 'DISABLED' : 'DEFAULT', ...(typeof entry.variant === 'string' ? { variant: entry.variant } : {}), flagMetadata: metadata };
    if (typeOf(entry.value) !== typeOf(defaultValue)) return { value: defaultValue, reason: 'ERROR', errorCode: 'TYPE_MISMATCH', errorMessage: `${flagKey} is a ${typeOf(entry.value)} flag at ${this.settings.name}`, flagMetadata: metadata };
    return { value: entry.value as T, reason, ...(typeof entry.variant === 'string' ? { variant: entry.variant } : {}), flagMetadata: metadata };
  }

  resolveBooleanEvaluation(flagKey: string, defaultValue: boolean, context: FlagContext) { return this.resolve(flagKey, defaultValue, context); }
  resolveStringEvaluation(flagKey: string, defaultValue: string, context: FlagContext) { return this.resolve(flagKey, defaultValue, context); }
  resolveNumberEvaluation(flagKey: string, defaultValue: number, context: FlagContext) { return this.resolve(flagKey, defaultValue, context); }
  resolveObjectEvaluation<T extends Record<string, unknown> | unknown[]>(flagKey: string, defaultValue: T, context: FlagContext) { return this.resolve(flagKey, defaultValue, context); }
}

/** One evaluation as an OFREP success or failure object. */
export function ofrepFlag(details: FlagEvaluation): Record<string, unknown> {
  const metadata = Object.fromEntries(Object.entries(details.flagMetadata).filter(([key]) => key !== 'source'));
  if (details.reason === 'ERROR') return { key: details.flagKey, errorCode: details.errorCode === 'TYPE_MISMATCH' || details.errorCode === 'FLAG_NOT_FOUND' ? 'GENERAL' : details.errorCode ?? 'GENERAL', ...(details.errorMessage ? { errorDetails: details.errorMessage } : {}), metadata };
  return { key: details.flagKey, value: details.value, reason: details.reason === 'DEFAULT' ? 'STATIC' : details.reason, ...(details.variant ? { variant: details.variant } : {}), metadata };
}

/** The bulk OFREP answer for a set of evaluations, with a strong ETag over its body. */
export function ofrepBulk(evaluations: FlagEvaluation[]): { body: { flags: Record<string, unknown>[] }; etag: string } {
  const body = { flags: evaluations.map(ofrepFlag) };
  return { body, etag: `"${createHash('sha256').update(JSON.stringify(body)).digest('base64url').slice(0, 27)}"` };
}

/** Context attributes the server sets from the signed-in person; a client's OFREP request cannot replace them. */
export const reservedContext: readonly string[] = ['targetingKey', 'userId', 'role', 'teams', 'tenantId', 'mode', 'labs', 'labsOff', 'flagVariants'];

/** A client's OFREP context, without the attributes the server owns, bounded in size. */
export function clientContext(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const entries = Object.entries(raw as Record<string, unknown>).filter(([key, value]) => !reservedContext.includes(key) && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key) && ['string', 'number', 'boolean'].includes(typeof value) && String(value).length <= 256).slice(0, 32);
  return Object.fromEntries(entries);
}
