import { createCipheriv, createDecipheriv, createECDH, createPrivateKey, createPublicKey, hkdfSync, randomBytes, sign, verify, type KeyObject } from 'node:crypto';

/** The record size Unfold writes: one record of at most 4096 bytes, as RFC 8291 examples use. */
export const recordSize = 4096;
/** How long a VAPID token Unfold signs stays valid: 12 hours, half of the 24 hours RFC 8292 allows. */
export const vapidLifetimeSeconds = 43_200;

/** Decodes base64url without padding, as Web Push and VAPID write keys. */
export function fromBase64Url(value: string): Buffer { return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }
/** Encodes base64url without padding. */
export function toBase64Url(value: Buffer | Uint8Array): string { return Buffer.from(value).toString('base64url'); }

/** A VAPID key pair: the uncompressed P-256 public point (65 bytes) and the private scalar (32 bytes), both base64url. */
export type VapidKeys = { publicKey: string; privateKey: string };

/** Whether `value` is an uncompressed P-256 public point in base64url. */
export function validPublicKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{86,88}$/.test(value)) return false;
  const bytes = fromBase64Url(value);
  return bytes.length === 65 && bytes[0] === 4;
}

function jwk(publicKey: string, privateKey?: string): Record<string, string> {
  const point = fromBase64Url(publicKey);
  if (point.length !== 65 || point[0] !== 4) throw new Error('A VAPID public key is an uncompressed P-256 point of 65 bytes');
  const base = { kty: 'EC', crv: 'P-256', x: toBase64Url(point.subarray(1, 33)), y: toBase64Url(point.subarray(33)) };
  if (privateKey === undefined) return base;
  if (fromBase64Url(privateKey).length !== 32) throw new Error('A VAPID private key is a P-256 scalar of 32 bytes');
  return { ...base, d: privateKey };
}

/** The signing key of a VAPID key pair; throws when the halves do not belong together. */
export function vapidSigningKey(keys: VapidKeys): KeyObject {
  let key: KeyObject;
  try { key = createPrivateKey({ key: jwk(keys.publicKey, keys.privateKey), format: 'jwk' }); }
  catch (error) { throw new Error(`The VAPID public key does not belong to the private key (${(error as Error).message})`); }
  const derived = createPublicKey(key).export({ format: 'jwk' }) as Record<string, string>;
  const given = jwk(keys.publicKey);
  if (derived.x !== given.x || derived.y !== given.y) throw new Error('The VAPID public key does not belong to the private key');
  return key;
}

/** Generates a VAPID key pair, for `scripts` and tests. */
export function generateVapidKeys(): VapidKeys {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { publicKey: toBase64Url(ecdh.getPublicKey()), privateKey: toBase64Url(ecdh.getPrivateKey()) };
}

/**
 * The `Authorization` header value of RFC 8292 for a push to `endpoint`: `vapid t=<JWT>, k=<public key>`, with an
 * ES256 JWT whose `aud` is the endpoint's origin, `sub` is `subject` and `exp` is `lifetimeSeconds` from `nowSeconds`.
 */
export function vapidAuthorization(endpoint: string, subject: string, keys: VapidKeys, nowSeconds = Math.floor(Date.now() / 1000), lifetimeSeconds = vapidLifetimeSeconds): string {
  const header = toBase64Url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = toBase64Url(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSeconds + lifetimeSeconds, sub: subject })));
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key: vapidSigningKey(keys), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${claims}.${toBase64Url(signature)}, k=${keys.publicKey}`;
}

/** Checks a VAPID JWT's ES256 signature against `publicKey` and returns its claims, or `null` when it does not verify. */
export function verifyVapidToken(token: string, publicKey: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(fromBase64Url(parts[0]).toString('utf8'));
    if (header.alg !== 'ES256') return null;
    const ok = verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key: createPublicKey({ key: jwk(publicKey), format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, fromBase64Url(parts[2]));
    return ok ? JSON.parse(fromBase64Url(parts[1]).toString('utf8')) : null;
  } catch { return null; }
}

/** A browser's push subscription keys: its P-256 public key (`p256dh`) and its 16-byte authentication secret (`auth`), base64url. */
export type SubscriptionKeys = { p256dh: string; auth: string };
/** The fixed inputs of {@link encryptPayload} that are random in production, for test vectors. */
export type EncryptionSeed = { salt?: Buffer; senderPrivateKey?: Buffer };

function derive(ecdhSecret: Buffer, authSecret: Buffer, uaPublic: Buffer, asPublic: Buffer, salt: Buffer): { key: Buffer; nonce: Buffer } {
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', ecdhSecret, authSecret, keyInfo, 32));
  return {
    key: Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16)),
    nonce: Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12)),
  };
}

/**
 * Encrypts `plaintext` for one push subscription as RFC 8291 describes: an ephemeral ECDH key, HKDF-SHA-256 with the
 * subscription's authentication secret, and one `aes128gcm` record (RFC 8188) with its header. The result is the
 * request body; it fits one record or throws.
 */
export function encryptPayload(plaintext: Buffer, keys: SubscriptionKeys, seed: EncryptionSeed = {}): Buffer {
  const uaPublic = fromBase64Url(keys.p256dh);
  const authSecret = fromBase64Url(keys.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('p256dh must be an uncompressed P-256 point');
  if (authSecret.length !== 16) throw new Error('auth must be 16 bytes');
  const sender = createECDH('prime256v1');
  if (seed.senderPrivateKey) sender.setPrivateKey(seed.senderPrivateKey); else sender.generateKeys();
  const asPublic = sender.getPublicKey();
  const salt = seed.salt ?? randomBytes(16);
  const { key, nonce } = derive(sender.computeSecret(uaPublic), authSecret, uaPublic, asPublic, salt);
  const record = Buffer.concat([plaintext, Buffer.from([2])]);
  if (record.length + 16 > recordSize) throw new Error('The notification does not fit one record');
  const cipher = createCipheriv('aes-128-gcm', key, nonce);
  const body = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(recordSize, 16);
  header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, body]);
}

/** Decrypts a one-record `aes128gcm` push message with the receiver's private key, as a browser would; for tests and fakes. */
export function decryptPayload(message: Buffer, receiverPrivateKey: Buffer, authSecret: Buffer): Buffer {
  const salt = message.subarray(0, 16);
  const idLength = message[20];
  const asPublic = message.subarray(21, 21 + idLength);
  const receiver = createECDH('prime256v1');
  receiver.setPrivateKey(receiverPrivateKey);
  const { key, nonce } = derive(receiver.computeSecret(asPublic), authSecret, receiver.getPublicKey(), asPublic, salt);
  const sealed = message.subarray(21 + idLength);
  const decipher = createDecipheriv('aes-128-gcm', key, nonce);
  decipher.setAuthTag(sealed.subarray(sealed.length - 16));
  const record = Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - 16)), decipher.final()]);
  let end = record.length - 1;
  while (end >= 0 && record[end] === 0) end--;
  if (record[end] !== 2) throw new Error('The record has no last-record delimiter');
  return record.subarray(0, end);
}
