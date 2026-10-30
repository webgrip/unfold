import { bucketRate, TokenBuckets, type BucketRate } from './intake/limiter.ts';

/** A limit counted per person: every mutation, the Asks and image generations that spend model money, and the exports that read a lot at once. */
export type PersonLimit = 'mutation' | 'ask' | 'export';
/** A limit counted per client address, for routes that answer before Unfold knows who is calling. */
export type AddressLimit = 'scim' | 'mcp' | 'webhook' | 'signIn';
/** Every limit the top-level `rateLimits` block sets. */
export type RateLimitName = PersonLimit | AddressLimit;
/** The deployment's `rateLimits`: one token bucket rate per limit. */
export type RateLimits = Record<RateLimitName, BucketRate>;

/** The rates used when the configuration names none. */
export const defaultRateLimits: Readonly<RateLimits> = Object.freeze({
  mutation: Object.freeze({ perMinute: 300, burst: 120 }),
  ask: Object.freeze({ perMinute: 20, burst: 10 }),
  export: Object.freeze({ perMinute: 20, burst: 10 }),
  scim: Object.freeze({ perMinute: 600, burst: 300 }),
  mcp: Object.freeze({ perMinute: 300, burst: 120 }),
  webhook: Object.freeze({ perMinute: 120, burst: 60 }),
  signIn: Object.freeze({ perMinute: 30, burst: 60 }),
});

const names = Object.keys(defaultRateLimits) as RateLimitName[];

/** Reads the optional top-level `rateLimits` block: `{mutation?, ask?, export?, scim?, mcp?, webhook?, signIn?}`, each `{perMinute, burst}`. */
export function rateLimitSettings(raw: unknown): RateLimits {
  if (raw !== undefined && (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !names.includes(key as RateLimitName)))) throw new Error(`rateLimits takes ${names.join(', ')}`);
  const entry = (raw ?? {}) as Record<string, unknown>;
  return Object.fromEntries(names.map(name => [name, bucketRate(entry[name], defaultRateLimits[name], `rateLimits.${name}`)])) as RateLimits;
}

const reads = new Set(['GET', 'HEAD', 'OPTIONS']);
const pollsByPost = [/^\/api\/ofrep\/v1\/evaluate\/flags(?:\/[^/]+)?$/, /^\/api\/linked-sessions\/[^/]+\/conversation\/wants$/];
const asks = [/^\/api\/ploeg\/work-items\/[^/]+\/asks$/, /^\/api\/card-art\/generate$/];
const exportRoutes: [string, RegExp][] = [
  ['GET', /^\/api\/ploeg\/cost-export$/],
  ['GET', /^\/api\/admin\/flags\/export$/],
  ['POST', /^\/api\/admin\/tenant-exports$/],
  ['GET', /^\/api\/admin\/tenant-exports\/[^/]+\/download$/],
  ['GET', /^\/api\/billing\/lines$/],
  ['POST', /^\/api\/billing\/sync$/],
  ['GET', /^\/api\/sessions\/[^/]+\/(?:candidate|delivery)\/download$/],
  ['GET', /^\/api\/linked-sessions\/[^/]+\/agent-trace$/],
];
const signIns: [string, RegExp][] = [
  ['POST', /^\/api\/login$/],
  ['POST', /^\/api\/auth\/editor$/],
  ['GET', /^\/api\/auth\/oidc$/],
  ['GET', /^\/api\/auth\/oidc\/callback$/],
  ['GET', /^\/api\/links\/[^/]+\/callback$/],
];

/** The per-person limits one signed-in request counts against: none for a read that is not an export. */
export function personLimits(method: string, path: string): PersonLimit[] {
  const found: PersonLimit[] = [];
  if (!reads.has(method) && !pollsByPost.some(pattern => pattern.test(path))) found.push('mutation');
  if (method === 'POST' && asks.some(pattern => pattern.test(path))) found.push('ask');
  if (exportRoutes.some(([verb, pattern]) => verb === method && pattern.test(path))) found.push('export');
  return found;
}

/** Whether a request starts or completes a sign-in, which counts against the `signIn` limit of its client address. */
export function isSignIn(method: string, path: string): boolean {
  return signIns.some(([verb, pattern]) => verb === method && pattern.test(path));
}

/** A refusal: the limit that ran out and the whole seconds until one more request fits. */
export type Refusal = { limit: RateLimitName; retryAfter: number };

/**
 * The deployment's rate limits, as token buckets kept in memory per process: a restart refills them and each replica
 * counts on its own. A request is refused when any limit it counts against has no token left.
 */
export class RateLimiter {
  private readonly buckets: TokenBuckets;
  private readonly limits: RateLimits;
  constructor(limits: RateLimits = rateLimitSettings(undefined), now: () => number = Date.now) {
    this.limits = limits;
    this.buckets = new TokenBuckets(now);
  }

  /** Takes one token from each of `limits` for `subject`; the longest wait among the limits that had none left. */
  take(limits: readonly RateLimitName[], subject: string): Refusal | undefined {
    let refusal: Refusal | undefined;
    for (const limit of limits) {
      const wait = this.buckets.take(`${limit}\u0000${subject}`, this.limits[limit]);
      if (wait && (!refusal || wait > refusal.retryAfter)) refusal = { limit, retryAfter: wait };
    }
    return refusal;
  }
}
