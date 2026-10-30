import { BlockList, isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';

/** One token bucket: `burst` requests at once, refilled at `perMinute`. */
export type BucketRate = { perMinute: number; burst: number };

/** How fast the public intake answers: per sending address, per source, and how many tokens a refused delivery costs. */
export type IntakeRateLimit = { client: BucketRate; source: BucketRate; failureCost: number };

/** The deployment's `intake` block: its rate limit. */
export type IntakeConfig = { rateLimit: IntakeRateLimit };

/** The limits used when the configuration names none. */
export const defaultIntakeRateLimit: IntakeRateLimit = Object.freeze({ client: Object.freeze({ perMinute: 60, burst: 30 }), source: Object.freeze({ perMinute: 300, burst: 60 }), failureCost: 5 });

const maxBuckets = 20_000;

function rate(raw: unknown, fallback: BucketRate, label: string): BucketRate {
  if (raw === undefined) return { ...fallback };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => key !== 'perMinute' && key !== 'burst')) throw new Error(`${label} takes perMinute and burst`);
  const entry = raw as Record<string, unknown>;
  const read = (value: unknown, fallbackValue: number, name: string) => {
    const number = value ?? fallbackValue;
    if (!Number.isInteger(number) || (number as number) < 1 || (number as number) > 100_000) throw new Error(`${label}.${name} must be a whole number from 1 to 100000`);
    return number as number;
  };
  return { perMinute: read(entry.perMinute, fallback.perMinute, 'perMinute'), burst: read(entry.burst, fallback.burst, 'burst') };
}

/** Reads a bucket rate an administrator set on one source; throws a message that starts with `label` otherwise. */
export function bucketRate(raw: unknown, fallback: BucketRate, label: string): BucketRate { return rate(raw, fallback, label); }

/** Reads the optional `intake` block: `{rateLimit: {client?, source?, failureCost?}}`, each rate `{perMinute, burst}`. */
export function intakeConfig(raw: unknown): IntakeConfig {
  if (raw === undefined) return { rateLimit: { client: { ...defaultIntakeRateLimit.client }, source: { ...defaultIntakeRateLimit.source }, failureCost: defaultIntakeRateLimit.failureCost } };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => key !== 'rateLimit')) throw new Error('intake takes only rateLimit');
  const limit = (raw as { rateLimit?: unknown }).rateLimit ?? {};
  if (!limit || typeof limit !== 'object' || Array.isArray(limit) || Object.keys(limit).some(key => !['client', 'source', 'failureCost'].includes(key))) throw new Error('intake.rateLimit takes client, source and failureCost');
  const entry = limit as Record<string, unknown>;
  const failureCost = entry.failureCost ?? defaultIntakeRateLimit.failureCost;
  if (!Number.isInteger(failureCost) || (failureCost as number) < 1 || (failureCost as number) > 1000) throw new Error('intake.rateLimit.failureCost must be a whole number from 1 to 1000');
  return { rateLimit: { client: rate(entry.client, defaultIntakeRateLimit.client, 'intake.rateLimit.client'), source: rate(entry.source, defaultIntakeRateLimit.source, 'intake.rateLimit.source'), failureCost: failureCost as number } };
}

/** Reads the optional top-level `trustedProxies`: IP addresses and CIDR ranges of the reverse proxies in front of Unfold. */
export function trustedProxySettings(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length > 100) throw new Error('trustedProxies must list at most 100 addresses or CIDR ranges');
  return raw.map(entry => {
    const [address, bits, extra] = typeof entry === 'string' ? entry.trim().split('/') : [];
    const family = isIP(address ?? '');
    const prefix = bits === undefined ? undefined : Number(bits);
    if (!family || extra !== undefined || (prefix !== undefined && (!Number.isInteger(prefix) || prefix < 0 || prefix > (family === 4 ? 32 : 128)))) throw new Error(`trustedProxies entry ${JSON.stringify(entry)} must be an IP address or a CIDR range such as 10.0.0.0/8`);
    return (entry as string).trim();
  });
}

const plain = (address: string) => address.startsWith('::ffff:') && isIP(address.slice(7)) === 4 ? address.slice(7) : address;

/**
 * The address a request came from. It is the socket's peer unless that peer is one of `trusted`: then it is the
 * right-most `X-Forwarded-For` entry that is not itself a trusted proxy. Without `trusted`, the header is ignored,
 * because any client can write it.
 */
export function clientAddress(req: Pick<IncomingMessage, 'headers' | 'socket'>, trusted: readonly string[] | undefined): string {
  const peer = plain(req.socket.remoteAddress ?? 'unknown');
  if (!trusted?.length) return peer;
  const list = new BlockList();
  for (const entry of trusted) {
    const [address, bits] = entry.split('/');
    const family = isIP(address) === 6 ? 'ipv6' : 'ipv4';
    if (bits === undefined) list.addAddress(address, family); else list.addSubnet(address, Number(bits), family);
  }
  const isTrusted = (address: string) => { const family = isIP(address); return family !== 0 && list.check(address, family === 6 ? 'ipv6' : 'ipv4'); };
  if (!isTrusted(peer)) return peer;
  const header = req.headers['x-forwarded-for'];
  const hops = (Array.isArray(header) ? header.join(',') : header ?? '').split(',').map(item => plain(item.trim())).filter(Boolean);
  for (let index = hops.length - 1; index >= 0; index--) {
    if (!isIP(hops[index])) return peer;
    if (!isTrusted(hops[index])) return hops[index];
  }
  return hops[0] ?? peer;
}

type Bucket = { tokens: number; at: number; rate: BucketRate };

/** Token buckets kept in memory, per process. A refusal says how many seconds until one more request fits. */
export class TokenBuckets {
  private readonly buckets = new Map<string, Bucket>();
  private readonly now: () => number;
  constructor(now: () => number = Date.now) { this.now = now; }

  private bucket(key: string, rate: BucketRate): Bucket {
    const at = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.rate.burst !== rate.burst || bucket.rate.perMinute !== rate.perMinute) {
      if (!bucket && this.buckets.size >= maxBuckets) this.prune(at);
      bucket = { tokens: Math.min(bucket?.tokens ?? rate.burst, rate.burst), at, rate };
      this.buckets.set(key, bucket);
    }
    bucket.tokens = Math.min(rate.burst, bucket.tokens + ((at - bucket.at) / 60_000) * rate.perMinute);
    bucket.at = at;
    return bucket;
  }

  private prune(at: number): void {
    for (const [key, bucket] of this.buckets) if (bucket.tokens + ((at - bucket.at) / 60_000) * bucket.rate.perMinute >= bucket.rate.burst) this.buckets.delete(key);
    if (this.buckets.size >= maxBuckets) this.buckets.clear();
  }

  /** Takes one token for `key`; the seconds to wait when none is left, otherwise 0. */
  take(key: string, rate: BucketRate): number {
    const bucket = this.bucket(key, rate);
    if (bucket.tokens >= 1) { bucket.tokens -= 1; return 0; }
    return Math.max(1, Math.ceil(((1 - bucket.tokens) / rate.perMinute) * 60));
  }

  /** Takes `cost` more tokens for `key`, down to an empty bucket and below, so a refused delivery slows its sender. */
  charge(key: string, rate: BucketRate, cost: number): void {
    const bucket = this.bucket(key, rate);
    bucket.tokens = Math.max(-rate.burst, bucket.tokens - cost);
  }
}
