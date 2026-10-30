import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as verifySignature } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

/** What a verifier is given: the request's headers, query and raw body, the source's secret and the clock. */
export type VerifyInput = { headers: IncomingHttpHeaders; query: URLSearchParams; body: Buffer; secret: string; nowMs: number; windowSeconds: number };

/** A verifier's answer: the delivery id to deduplicate on when the sender gives one, or why the request is refused. */
export type Verdict = { ok: true; deliveryId: string | null } | { ok: false; code: 'signature_missing' | 'signature_invalid' | 'timestamp_outside_window'; message: string };

/** One way of proving an inbound request came from the configured sender. */
export type Verifier = {
  name: string;
  signed: boolean;
  generatesSecret: boolean;
  verify(input: VerifyInput): Verdict;
  newSecret?(): string;
  checkSecret(secret: string): string | undefined;
};

/** The name of a registered verifier. */
export type VerifierName = 'standard-webhooks' | 'token' | 'hub-signature-256' | 'zendesk' | (string & {});

const verifiers = new Map<string, Verifier>();

/** Adds a verifier to the registry; a second verifier with the same name is refused. */
export function registerVerifier(verifier: Verifier): void {
  if (verifiers.has(verifier.name)) throw new Error(`Intake verifier ${verifier.name} is already registered`);
  verifiers.set(verifier.name, verifier);
}

/** The verifier registered as `name`, if any. */
export function intakeVerifier(name: string): Verifier | undefined { return verifiers.get(name); }

/** The names of every registered verifier. */
export function intakeVerifierNames(): string[] { return [...verifiers.keys()]; }

const header = (headers: IncomingHttpHeaders, name: string): string | undefined => {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
};

function equal(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

const missing = (message: string): Verdict => ({ ok: false, code: 'signature_missing', message });
const invalid: Verdict = { ok: false, code: 'signature_invalid', message: 'The signature does not match this intake source.' };
const outside: Verdict = { ok: false, code: 'timestamp_outside_window', message: 'The request timestamp is outside the replay window.' };

/**
 * The content a Standard Webhooks sender signs: `<webhook-id>.<webhook-timestamp>.<body>`, and its `v1` signature
 * with a `whsec_` secret, for senders and tests.
 */
export function standardWebhookSignature(secret: string, id: string, timestamp: number, body: string | Buffer): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  return `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.`).update(body).digest('base64')}`;
}

registerVerifier({
  name: 'standard-webhooks',
  signed: true,
  generatesSecret: true,
  newSecret: () => `whsec_${randomBytes(32).toString('base64')}`,
  checkSecret: secret => /^whsec_[A-Za-z0-9+/]{32,}={0,2}$/.test(secret) || /^whpk_[A-Za-z0-9+/]{42,}={0,2}$/.test(secret) ? undefined : 'A Standard Webhooks secret starts with whsec_ (or whpk_ for an ed25519 public key) followed by base64',
  verify({ headers, body, secret, nowMs, windowSeconds }) {
    const id = header(headers, 'webhook-id');
    const stamp = header(headers, 'webhook-timestamp');
    const signatures = header(headers, 'webhook-signature');
    if (!id || !stamp || !signatures) return missing('Send webhook-id, webhook-timestamp and webhook-signature (Standard Webhooks).');
    if (!/^[1-9][0-9]{0,11}$/.test(stamp) || id.length > 200) return invalid;
    if (Math.abs(nowMs / 1000 - Number(stamp)) > windowSeconds) return outside;
    const content = Buffer.concat([Buffer.from(`${id}.${stamp}.`), body]);
    const candidates = signatures.split(' ').slice(0, 10).map(entry => entry.split(','));
    if (secret.startsWith('whpk_')) {
      try {
        const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(secret.slice(5), 'base64').toString('base64url') }, format: 'jwk' });
        return candidates.some(([version, value]) => version === 'v1a' && value && verifySignature(null, content, key, Buffer.from(value, 'base64'))) ? { ok: true, deliveryId: id } : invalid;
      } catch { return invalid; }
    }
    const expected = createHmac('sha256', Buffer.from(secret.slice(6), 'base64')).update(content).digest();
    return candidates.some(([version, value]) => version === 'v1' && value !== undefined && equal(Buffer.from(value, 'base64'), expected)) ? { ok: true, deliveryId: id } : invalid;
  },
});

registerVerifier({
  name: 'token',
  signed: false,
  generatesSecret: true,
  newSecret: () => randomBytes(32).toString('base64url'),
  checkSecret: secret => /^[A-Za-z0-9_-]{32,256}$/.test(secret) ? undefined : 'A token is 32 to 256 letters, digits, - or _',
  verify({ headers, query, secret }) {
    const authorization = header(headers, 'authorization') ?? '';
    const bearer = /^Bearer (\S+)$/i.exec(authorization)?.[1];
    const basic = /^Basic ([A-Za-z0-9+/=]+)$/i.exec(authorization)?.[1];
    const password = basic ? Buffer.from(basic, 'base64').toString('utf8').split(':').slice(1).join(':') : undefined;
    const given = header(headers, 'x-unfold-intake-token') ?? bearer ?? password ?? query.get('token') ?? undefined;
    if (!given) return missing('Send the intake token in X-Unfold-Intake-Token, Authorization: Bearer, as the Basic auth password, or as ?token=.');
    const digest = (value: string) => createHash('sha256').update(value).digest();
    return equal(digest(given), digest(secret)) ? { ok: true, deliveryId: null } : invalid;
  },
});

registerVerifier({
  name: 'hub-signature-256',
  signed: true,
  generatesSecret: true,
  newSecret: () => randomBytes(32).toString('base64url'),
  checkSecret: secret => secret.length >= 16 && secret.length <= 512 ? undefined : 'An HMAC secret is 16 to 512 characters',
  verify({ headers, body, secret }) {
    const given = header(headers, 'x-hub-signature-256');
    if (!given) return missing('Send X-Hub-Signature-256: sha256=<hex HMAC of the body>.');
    const value = /^sha256=([0-9a-f]{64})$/i.exec(given)?.[1];
    if (!value) return invalid;
    return equal(Buffer.from(value.toLowerCase(), 'hex'), createHmac('sha256', secret).update(body).digest()) ? { ok: true, deliveryId: null } : invalid;
  },
});

registerVerifier({
  name: 'zendesk',
  signed: true,
  generatesSecret: false,
  checkSecret: secret => secret.length >= 16 && secret.length <= 512 ? undefined : 'Paste the webhook signing secret Zendesk shows, 16 to 512 characters',
  verify({ headers, body, secret, nowMs, windowSeconds }) {
    const given = header(headers, 'x-zendesk-webhook-signature');
    const stamp = header(headers, 'x-zendesk-webhook-signature-timestamp');
    if (!given || !stamp) return missing('Send X-Zendesk-Webhook-Signature and X-Zendesk-Webhook-Signature-Timestamp.');
    const at = Date.parse(stamp);
    if (!Number.isFinite(at)) return invalid;
    if (Math.abs(nowMs - at) / 1000 > windowSeconds) return outside;
    const expected = createHmac('sha256', secret).update(stamp).update(body).digest();
    return equal(Buffer.from(given, 'base64'), expected) ? { ok: true, deliveryId: null } : invalid;
  },
});
