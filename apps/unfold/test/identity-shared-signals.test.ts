import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from './api-support.ts';
import { signIn } from './oidc-support.ts';
import { identityBench, push, transmitter } from './identity-support.ts';
import { SetError, SetVerifier } from '../src/identity/shared-signals.ts';
import { subjectUserId } from '../src/oidc.ts';

const caep = 'https://schemas.openid.net/secevent/caep/event-type/';
const risc = 'https://schemas.openid.net/secevent/risc/event-type/';
const cookieOf = (response: Response) => response.headers.get('set-cookie')!.split(';')[0];

async function refusal(verifier: SetVerifier, token: string): Promise<string> {
  try { await verifier.verify(token); } catch (error) { if (error instanceof SetError) return error.err; throw error; }
  return 'accepted';
}

test('a SET is accepted only when its signature, typ, issuer, audience, jti and age check out', async t => {
  const sender = await transmitter();
  t.after(() => sender.close());
  const audience = 'https://unfold.test';
  const verifier = new SetVerifier({ audience, maxAgeHours: 24, transmitters: [{ name: 'idp', issuer: sender.issuer, jwksUri: sender.jwksUri }] });
  const events = { [`${caep}session-revoked`]: { event_timestamp: 1 } };
  const sub_id = { format: 'email', email: 'person@example.com' };
  const verified = await verifier.verify(sender.set({ aud: audience, sub_id, events }));
  assert.equal(verified.transmitter.name, 'idp');
  assert.deepEqual(verified.events, [{ type: `${caep}session-revoked`, action: 'reauthenticate', subject: sub_id }]);
  assert.equal(await refusal(verifier, sender.set({ aud: audience, sub_id, events }, { wrongKey: true })), 'invalid_key', 'a forged signature');
  assert.equal(await refusal(verifier, sender.set({ aud: audience, sub_id, events }, { kid: 'unknown' })), 'invalid_key', 'a key the transmitter never published');
  assert.equal(await refusal(verifier, sender.set({ aud: audience, sub_id, events, iss: 'https://evil.example' })), 'invalid_issuer');
  assert.equal(await refusal(verifier, sender.set({ aud: 'https://other.example', sub_id, events })), 'invalid_audience');
  assert.equal(await refusal(verifier, sender.set({ aud: audience, sub_id, events }, { typ: null })), 'invalid_request', 'a JWT that is not typed as a SET');
  assert.equal(await refusal(verifier, sender.set({ aud: audience, sub_id, events, jti: undefined })), 'invalid_request');
  assert.equal(await refusal(verifier, sender.set({ aud: audience, sub_id, events, iat: Math.floor(Date.now() / 1000) - 25 * 3600 })), 'invalid_request', 'older than maxAgeHours');
  assert.equal(await refusal(verifier, sender.set({ aud: audience, sub_id, events: {} })), 'invalid_request');
  assert.equal(await refusal(verifier, 'not.a.jwt!'), 'invalid_request');
  const unknown = await verifier.verify(sender.set({ aud: [audience], sub_id, events: { 'https://example.com/event/unknown': {} } }));
  assert.equal(unknown.events[0].action, 'ignore');
});

test('a pushed session-revoked ends every credential, a replayed jti is not acted on twice, and an unknown event changes nothing', async t => {
  const { server, idp, sender, audience } = await identityBench(t);
  const issuer = server.config.auth.oidc!.issuer;
  const userId = subjectUserId(issuer, 'person@example.com');
  const sub_id = { format: 'iss_sub', iss: issuer, sub: 'person@example.com' };
  const first = cookieOf((await signIn(server, idp)).callback);
  const revoked = sender.set({ aud: audience, sub_id, events: { [`${caep}session-revoked`]: { event_timestamp: Math.floor(Date.now() / 1000) } } });
  const accepted = await push(server.url, revoked);
  assert.equal(accepted.status, 202, JSON.stringify(accepted.body));
  assert.equal(accepted.body, '');
  assert.equal((await request(server.url, '/api/bootstrap', { cookie: first })).status, 401);
  const second = cookieOf((await signIn(server, idp)).callback);
  assert.equal((await request(server.url, '/api/bootstrap', { cookie: second })).status, 200, 'session-revoked forces a new sign-in and leaves the account on');
  assert.equal((await push(server.url, revoked)).status, 202, 'a replayed SET is acknowledged');
  assert.equal((await request(server.url, '/api/bootstrap', { cookie: second })).status, 200, 'and not acted on again');
  const unknown = await push(server.url, sender.set({ aud: audience, sub_id, events: { 'https://example.com/event/unknown': {} } }));
  assert.equal(unknown.status, 202);
  assert.equal((await request(server.url, '/api/bootstrap', { cookie: second })).status, 200);
  const refused = await push(server.url, sender.set({ aud: 'https://other.example', sub_id, events: { [`${caep}session-revoked`]: {} } }));
  assert.equal(refused.status, 400);
  assert.deepEqual(refused.body, { err: 'invalid_audience', description: 'The SET is for another audience.' });
  assert.equal((await request(server.url, '/api/bootstrap', { cookie: second })).status, 200);
  const records = server.app.store.actionRecords({ channel: 'ssf', limit: 20 });
  assert.ok(records.some(record => record.action === 'SSF caep/session-revoked' && record.target?.id === userId));
  assert.ok(records.some(record => record.action === 'REVOKE ssf.caep/session-revoked'));
  assert.ok(records.some(record => record.action === 'SSF https://example.com/event/unknown' && record.inputs.outcome === 'ignore'));
});

test('RISC account-disabled turns the account off until account-enabled, matched by email in a complex subject', async t => {
  const { server, idp, sender, audience } = await identityBench(t);
  const cookie = cookieOf((await signIn(server, idp)).callback);
  const sub_id = { format: 'complex', user: { format: 'email', email: 'Person@example.com' }, session: { format: 'opaque', id: 'abc' } };
  assert.equal((await push(server.url, sender.set({ aud: audience, sub_id, events: { [`${risc}account-disabled`]: { reason: 'hijacking' } } }))).status, 202);
  assert.equal((await request(server.url, '/api/bootstrap', { cookie })).status, 401);
  assert.equal((await signIn(server, idp)).callback.headers.get('location'), '/?login_error=account_disabled');
  assert.equal((await push(server.url, sender.set({ aud: audience, sub_id, events: { [`${risc}account-enabled`]: {} } }))).status, 202);
  assert.equal((await signIn(server, idp)).callback.headers.get('location'), '/');
});

test('the receiver answers 404 while its flag is off', async t => {
  const { server, sender, audience } = await identityBench(t, { signals: false });
  assert.equal((await push(server.url, sender.set({ aud: audience, events: { [`${caep}session-revoked`]: {} } }))).status, 404);
});
