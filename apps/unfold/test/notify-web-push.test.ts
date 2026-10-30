import test from 'node:test';
import assert from 'node:assert/strict';
import { decryptPayload, encryptPayload, fromBase64Url, generateVapidKeys, toBase64Url, vapidAuthorization, vapidSigningKey, verifyVapidToken } from '../src/notify/web-push.ts';

const printed = (...lines: string[]) => lines.join('');
const rfc8291 = {
  plaintext: 'When I grow up, I want to be a watermelon',
  sender: printed('yfWPiYE-n46HLnH0', 'KqZOF1fJJU3MYrct3AELtAQ-oRw'),
  receiver: printed('q1dXpw3UpT5VOmu_', 'cf_v6ih07Aems3njxI-JWgLcM94'),
  receiverPoint: printed('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcx', 'aOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'),
  salt: printed('DGv6ra1nlYgD', 'CS1FRnbzlw'),
  shared: printed('BTBZMqHH', '6r4Tts7J_aSIgg'),
  message: printed(
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml',
    'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT',
    'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
  ),
};
const subscription = { p256dh: rfc8291.receiverPoint, auth: rfc8291.shared };

test('aes128gcm encryption reproduces the RFC 8291 section 5 message byte for byte', () => {
  const message = encryptPayload(Buffer.from(rfc8291.plaintext), subscription, { salt: fromBase64Url(rfc8291.salt), senderPrivateKey: fromBase64Url(rfc8291.sender) });
  assert.equal(toBase64Url(message), rfc8291.message);
  assert.equal(message.readUInt32BE(16), 4096);
});

test('the RFC 8291 message decrypts with the receiver key, and a random encryption round-trips', () => {
  assert.equal(decryptPayload(fromBase64Url(rfc8291.message), fromBase64Url(rfc8291.receiver), fromBase64Url(rfc8291.shared)).toString(), rfc8291.plaintext);
  const message = encryptPayload(Buffer.from('{"title":"x"}'), subscription);
  assert.notEqual(toBase64Url(message.subarray(0, 16)), rfc8291.salt);
  assert.equal(decryptPayload(message, fromBase64Url(rfc8291.receiver), fromBase64Url(rfc8291.shared)).toString(), '{"title":"x"}');
});

test('encryption refuses malformed subscription keys and oversized notices', () => {
  assert.throws(() => encryptPayload(Buffer.from('x'), { p256dh: 'AAAA', auth: rfc8291.shared }), /p256dh/);
  assert.throws(() => encryptPayload(Buffer.from('x'), { p256dh: rfc8291.receiverPoint, auth: 'AAAA' }), /auth/);
  assert.throws(() => encryptPayload(Buffer.alloc(5000), subscription), /one record/);
});

test('the RFC 8292 section 2.4 example token verifies against its example key', () => {
  const token = printed(
    'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJhdWQiOiJodHRwczovL3',
    'B1c2guZXhhbXBsZS5uZXQiLCJleHAiOjE0NTM1MjM3NjgsInN1YiI6Im1ha',
    'Wx0bzpwdXNoQGV4YW1wbGUuY29tIn0.i3CYb7t4xfxCDquptFOepC9GAu_H',
    'LGkMlMuCGSK2rpiUfnK9ojFwDXb1JrErtmysazNjjvW2L9OkSSHzvoD1oA',
  );
  const point = printed('BA1Hxzyi1RUM1b5wjxsn7nGxAszw2u61m164i3MrAIxHF6YK5h4SDYic-dR', 'uU_RCPCfA5aq9ojSwk5Y2EmClBPs');
  assert.deepEqual(verifyVapidToken(token, point), { aud: 'https://push.example.net', exp: 1453523768, sub: 'mailto:push@example.com' });
  assert.equal(verifyVapidToken(token.slice(0, -2) + 'AA', point), null);
});

test('a VAPID header names the origin, the subject and a 12-hour expiry, and verifies with the public key', () => {
  const keys = generateVapidKeys();
  const header = vapidAuthorization('https://push.example.net/push/abc?x=1', 'mailto:ops@example.org', keys, 1_000_000);
  const match = /^vapid t=([^,]+), k=(.+)$/.exec(header);
  assert.ok(match);
  assert.equal(match[2], keys.publicKey);
  assert.deepEqual(JSON.parse(fromBase64Url(match[1].split('.')[0]).toString()), { typ: 'JWT', alg: 'ES256' });
  assert.deepEqual(verifyVapidToken(match[1], keys.publicKey), { aud: 'https://push.example.net', exp: 1_043_200, sub: 'mailto:ops@example.org' });
  assert.equal(verifyVapidToken(match[1], generateVapidKeys().publicKey), null);
});

test('a VAPID key pair whose halves do not match is refused', () => {
  const one = generateVapidKeys();
  const other = generateVapidKeys();
  assert.throws(() => vapidSigningKey({ publicKey: one.publicKey, privateKey: other.privateKey }), /does not belong/);
});
