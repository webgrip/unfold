import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** The prefix Standard Webhooks gives a symmetric secret. */
export const secretPrefix = 'whsec_';
/** How far a `webhook-timestamp` may be from the verifier's clock, in seconds, before verification refuses it. */
export const timestampToleranceSeconds = 300;

/** A new subscription secret: `whsec_` and 32 random bytes as base64. */
export function newSecret(): string {
  return `${secretPrefix}${randomBytes(32).toString('base64')}`;
}

function keyOf(secret: string): Buffer {
  const key = Buffer.from(secret.startsWith(secretPrefix) ? secret.slice(secretPrefix.length) : secret, 'base64');
  if (key.length < 16) throw new Error('A webhook secret must hold at least 16 bytes');
  return key;
}

/** The Standard Webhooks `v1` signature of one message: `v1,` and base64 HMAC-SHA256 of `id.timestamp.payload`. */
export function sign(secret: string, id: string, timestamp: number, payload: string | Uint8Array): string {
  const mac = createHmac('sha256', keyOf(secret));
  mac.update(`${id}.${timestamp}.`);
  mac.update(payload);
  return `v1,${mac.digest('base64')}`;
}

/** The three Standard Webhooks headers for one attempt, signed with every secret in `secrets`, space-delimited. */
export function webhookHeaders(secrets: readonly string[], id: string, timestamp: number, payload: string): Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string> {
  return { 'webhook-id': id, 'webhook-timestamp': String(timestamp), 'webhook-signature': secrets.map(secret => sign(secret, id, timestamp, payload)).join(' ') };
}

/** Why {@link verify} refused a message. */
export type VerifyFailure = 'missing_headers' | 'timestamp_out_of_range' | 'no_matching_signature';

/**
 * Verifies a received message as a Standard Webhooks receiver would: the three headers present, the timestamp within
 * `toleranceSeconds` of `now`, and one `v1` signature in the header matching the raw payload. Returns the failure, or
 * `undefined` when it verifies.
 */
export function verify(secret: string, headers: Record<string, string | undefined>, payload: string | Uint8Array, { now = Date.now(), toleranceSeconds = timestampToleranceSeconds }: { now?: number; toleranceSeconds?: number } = {}): VerifyFailure | undefined {
  const id = headers['webhook-id'];
  const stamp = headers['webhook-timestamp'];
  const signatures = headers['webhook-signature'];
  if (!id || !stamp || !signatures) return 'missing_headers';
  const timestamp = Number(stamp);
  if (!/^\d{1,12}$/.test(stamp) || Math.abs(now / 1000 - timestamp) > toleranceSeconds) return 'timestamp_out_of_range';
  const expected = Buffer.from(sign(secret, id, timestamp, payload).slice(3), 'base64');
  for (const entry of signatures.split(' ')) {
    const [version, value] = entry.split(',', 2);
    if (version !== 'v1' || !value) continue;
    const given = Buffer.from(value, 'base64');
    if (given.length === expected.length && timingSafeEqual(given, expected)) return undefined;
  }
  return 'no_matching_signature';
}
