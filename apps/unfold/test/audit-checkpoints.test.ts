import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { generateKeyPairSync, randomBytes, sign as edSign, verify as edVerify } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.ts';
import { AuditTrail } from '../src/audit/service.ts';
import { auditSettings } from '../src/audit/settings.ts';
import { checkpointKey, checkpointPayload, type AuditCheckpoint } from '../src/audit/checkpoints.ts';
import { signS3Request } from '../src/audit/object-store.ts';
import type { AuditConfig } from '../src/types.ts';
import { application, login, request } from './api-support.ts';

const dayMs = 86_400_000;
const ada = { id: 'u-ada', name: 'ada@example.test', role: 'admin' as const, memberships: [{ kind: 'tenant' as const, tenant: 'default', role: 'admin' as const }] };

const body = (req: IncomingMessage) => new Promise<string>(resolve => { let text = ''; req.setEncoding('utf8'); req.on('data', chunk => { text += chunk; }); req.on('end', () => resolve(text)); });

async function listen(server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** An OpenBao stand-in: one ed25519 Transit key, a token and a Kubernetes auth role. */
async function fakeTransit(options: { token?: string; role?: string; jwt?: string } = {}) {
  let keys = [generateKeyPairSync('ed25519')];
  const tokens = new Set(options.token ? [options.token] : []);
  const calls: string[] = [];
  const state = { down: false, logins: 0, keys: () => keys };
  const server = createServer(async (req, res) => {
    const text = await body(req);
    calls.push(`${req.method} ${req.url}`);
    const answer = (status: number, value: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (state.down) return answer(503, { errors: ['Vault is sealed'] });
    const input = JSON.parse(text || '{}');
    if (req.url === '/v1/auth/kubernetes/login') {
      if (input.role !== options.role || input.jwt !== options.jwt) return answer(403, { errors: ['permission denied'] });
      state.logins++;
      const token = `s.${randomBytes(8).toString('hex')}`;
      tokens.add(token);
      return answer(200, { auth: { client_token: token, lease_duration: 3600 } });
    }
    if (!tokens.has(String(req.headers['x-vault-token']))) return answer(403, { errors: ['permission denied'] });
    if (req.url === '/v1/transit/sign/unfold-audit') {
      const version = keys.length;
      const signature = edSign(null, Buffer.from(input.input, 'base64'), keys[version - 1].privateKey).toString('base64');
      return answer(200, { data: { signature: `vault:v${version}:${signature}`, key_version: version } });
    }
    if (req.url === '/v1/transit/verify/unfold-audit') {
      const match = /^vault:v(\d+):(.+)$/.exec(String(input.signature));
      const key = match ? keys[Number(match[1]) - 1] : undefined;
      if (!match || !key) return answer(400, { errors: ['invalid signature'] });
      return answer(200, { data: { valid: edVerify(null, Buffer.from(input.input, 'base64'), key.publicKey, Buffer.from(match[2], 'base64')) } });
    }
    answer(404, { errors: [] });
  });
  const url = await listen(server);
  return { url, calls, state, tokens, rotate: () => { keys = [...keys, generateKeyPairSync('ed25519')]; }, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

/** An S3 stand-in: checks the SigV4 signature, keeps objects, refuses to overwrite a locked one, pages listings by two. */
async function fakeBucket(credentials: { accessKeyId: string; secretAccessKey: string; region: string }) {
  const objects = new Map<string, { body: string; headers: IncomingMessage['headers'] }>();
  const state = { down: false, refusedSignatures: 0 };
  const server = createServer(async (req, res) => {
    const text = await body(req);
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const sent = Object.fromEntries(Object.entries(req.headers).filter(([name]) => /^(x-amz-|content-md5$|content-type$)/.test(name)).map(([name, value]) => [name, String(value)]));
    const { 'x-amz-date': date, 'x-amz-content-sha256': payloadHash, ...signedExtra } = sent;
    const at = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`);
    const expected = signS3Request({ method: req.method ?? 'GET', url, headers: signedExtra, payloadHash, region: credentials.region, accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey, at });
    if (state.down) { res.writeHead(503); return res.end('<Error><Code>SlowDown</Code></Error>'); }
    if (expected.authorization !== req.headers.authorization) { state.refusedSignatures++; res.writeHead(403); return res.end('<Error><Code>SignatureDoesNotMatch</Code></Error>'); }
    const key = decodeURIComponent(url.pathname.replace(/^\/bucket\/?/, ''));
    if (req.method === 'PUT') {
      if (objects.has(key)) { res.writeHead(403); return res.end('<Error><Code>AccessDenied</Code></Error>'); }
      objects.set(key, { body: text, headers: req.headers });
      res.writeHead(200); return res.end();
    }
    if (url.searchParams.get('list-type') === '2') {
      const all = [...objects.keys()].filter(name => name.startsWith(url.searchParams.get('prefix') ?? '')).sort();
      const from = Number(url.searchParams.get('continuation-token') ?? 0);
      const page = all.slice(from, from + 2);
      const more = from + 2 < all.length;
      res.writeHead(200, { 'content-type': 'application/xml' });
      return res.end(`<ListBucketResult>${page.map(name => `<Contents><Key>${name.replace(/&/g, '&amp;')}</Key></Contents>`).join('')}<IsTruncated>${more}</IsTruncated>${more ? `<NextContinuationToken>${from + 2}</NextContinuationToken>` : ''}</ListBucketResult>`);
    }
    const found = objects.get(key);
    if (!found) { res.writeHead(404); return res.end('<Error><Code>NoSuchKey</Code></Error>'); }
    res.writeHead(200); res.end(found.body);
  });
  const url = await listen(server);
  return { url: `${url}/bucket`, objects, state, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

const credentials = { accessKeyId: 'AKIDTESTONLY', secretAccessKey: randomBytes(20).toString('hex'), region: 'eu-central-1' };

async function rig(t: test.TestContext, options: { signer?: boolean; bucket?: boolean; lockDays?: number } = {}) {
  const token = randomBytes(12).toString('hex');
  const transit = await fakeTransit({ token });
  const bucket = await fakeBucket(credentials);
  t.after(async () => { await transit.close(); await bucket.close(); });
  const clock = { now: new Date('2026-10-30T09:00:00Z') };
  const env: NodeJS.ProcessEnv = {
    ...(options.signer !== false ? { UNFOLD_AUDIT_OPENBAO_ADDR: transit.url, UNFOLD_AUDIT_OPENBAO_TOKEN: token } : {}),
    ...(options.bucket !== false ? { UNFOLD_AUDIT_CHECKPOINT_URL: bucket.url, UNFOLD_AUDIT_CHECKPOINT_REGION: credentials.region, UNFOLD_AUDIT_CHECKPOINT_ACCESS_KEY_ID: credentials.accessKeyId, UNFOLD_AUDIT_CHECKPOINT_SECRET_ACCESS_KEY: credentials.secretAccessKey, ...(options.lockDays ? { UNFOLD_AUDIT_CHECKPOINT_LOCK_DAYS: String(options.lockDays) } : {}) } : {}),
  };
  const settings: AuditConfig = auditSettings(undefined, env);
  const store = new Store(':memory:');
  const lines: string[] = [];
  const audit = new AuditTrail({ store, settings, now: () => clock.now, log: line => lines.push(line) });
  const record = () => audit.record({ fact: { kind: 'sign_in', method: 'password', user: ada, outcome: 'success' }, actor: { user: ada } });
  return { transit, bucket, clock, store, audit, lines, record, token };
}

test('Signature Version 4 matches the AWS documentation example for S3 GET Object', () => {
  const headers = signS3Request({ method: 'GET', url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'), headers: { Range: 'bytes=0-9' }, region: 'us-east-1', accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', at: new Date('2013-05-24T00:00:00Z') });
  assert.equal(headers.authorization, 'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
});

test('once a day each Tenant\'s chain head is signed with Transit and copied to the bucket under Object Lock', async t => {
  const { transit, bucket, clock, store, audit, lines, record } = await rig(t, { lockDays: 400 });
  record(); record();
  await audit.checkpoint();
  const [first] = audit.checkpoints!.local('default');
  assert.deepEqual([first.sequence, first.head_hash, first.signer, first.key_version, first.storedAt !== null], [2, audit.chain.head('default')!.hash, { kind: 'openbao-transit', key: 'unfold-audit' }, 1, true]);
  assert.match(first.signature!, /^vault:v1:/);
  const key = checkpointKey('unfold-audit', first);
  assert.equal(key, 'unfold-audit/default/000000000002-20261030T090000Z.json');
  const stored = bucket.objects.get(key)!;
  assert.deepEqual(JSON.parse(stored.body), (({ storedAt: _storedAt, ...checkpoint }) => checkpoint)(first));
  assert.deepEqual([stored.headers['x-amz-object-lock-mode'], stored.headers['x-amz-object-lock-retain-until-date']], ['COMPLIANCE', '2027-12-04T09:00:00Z']);
  assert.equal(bucket.state.refusedSignatures, 0);
  assert.ok(lines.some(line => JSON.parse(line).event === 'audit.checkpoint'));

  record();
  clock.now = new Date(clock.now.getTime() + 23 * 3_600_000);
  await audit.checkpoint();
  assert.equal(audit.checkpoints!.local('default').length, 1, 'a day has not passed');
  clock.now = new Date(clock.now.getTime() + 2 * 3_600_000);
  transit.rotate();
  await audit.checkpoint();
  const second = audit.checkpoints!.local('default')[1];
  assert.deepEqual([second.sequence, second.key_version, bucket.objects.size], [3, 2, 2], 'the next day checkpoints the new head with the rotated key');

  const newest = await audit.checkpoints!.verify('default');
  assert.deepEqual([newest.ok, newest.source, newest.checked, newest.newest?.sequence, newest.newest?.keyVersion], [true, 'object_storage', 1, 3, 2]);
  const all = await audit.checkpoints!.verify('default', { all: true });
  assert.deepEqual([all.ok, all.checked], [true, 2], 'every checkpoint verifies, with old and new key versions');
  assert.throws(() => store.db.prepare('DELETE FROM audit_checkpoints').run(), /never removed/);
  assert.throws(() => store.db.prepare("UPDATE audit_checkpoints SET hash='x'").run(), /append-only/);
});

test('a chain rolled back or rewritten behind the triggers no longer matches its checkpoint, and an edited checkpoint fails its signature', async t => {
  const { bucket, store, audit, record } = await rig(t);
  for (let index = 0; index < 4; index++) record();
  await audit.checkpoint();
  assert.equal(audit.chain.verify('default').ok, true);

  store.db.exec('DROP TRIGGER audit_records_anchored_delete');
  store.db.prepare("DELETE FROM audit_records WHERE tenant_id='default' AND seq>2").run();
  assert.equal(audit.chain.verify('default').ok, true, 'the shortened chain still verifies on its own');
  const rolledBack = await audit.checkpoints!.verify('default');
  assert.deepEqual([rolledBack.ok, rolledBack.problems.map(problem => problem.reason)], [false, ['ahead_of_chain']]);
  record(); record();
  const replaced = await audit.checkpoints!.verify('default');
  assert.deepEqual(replaced.problems.map(problem => problem.reason), ['hash_mismatch'], 'records written again in place of the removed ones have other hashes');

  const [key, object] = [...bucket.objects][0];
  const edited: AuditCheckpoint = { ...JSON.parse(object.body), head_hash: audit.chain.head('default')!.hash, sequence: 4 };
  bucket.objects.set(key, { ...object, body: JSON.stringify(edited) });
  const forged = await audit.checkpoints!.verify('default');
  assert.deepEqual(forged.problems.map(problem => problem.reason), ['bad_signature'], 'a checkpoint edited to match the rewritten chain fails its signature');
});

test('a sealed OpenBao skips the checkpoint and an unreachable bucket keeps it until the next run; verification reports both', async t => {
  const { transit, bucket, clock, audit, lines, record } = await rig(t);
  record();
  transit.state.down = true;
  await audit.checkpoint();
  assert.equal(audit.checkpoints!.local('default').length, 0, 'nothing unsigned is written while a signer is configured');
  assert.match(lines.find(line => line.includes('audit.checkpoint_failed')) ?? '', /HTTP 503: Vault is sealed/);
  transit.state.down = false;
  bucket.state.down = true;
  await audit.checkpoint();
  assert.deepEqual(audit.checkpoints!.local('default').map(entry => entry.storedAt), [null]);
  const unavailable = await audit.checkpoints!.verify('default');
  assert.deepEqual([unavailable.ok, unavailable.problems[0].reason], [false, 'storage_unavailable']);
  bucket.state.down = false;
  clock.now = new Date(clock.now.getTime() + 3_600_000);
  await audit.checkpoint();
  assert.equal(bucket.objects.size, 1, 'the next hourly run copies it');
  assert.ok(audit.checkpoints!.local('default')[0].storedAt);

  transit.state.down = true;
  const unchecked = await audit.checkpoints!.verify('default');
  assert.deepEqual(unchecked.problems.map(problem => problem.reason), ['signer_unavailable']);
  transit.state.down = false;
  clock.now = new Date(clock.now.getTime() + 3 * dayMs);
  transit.state.down = true;
  await audit.checkpoint();
  transit.state.down = false;
  assert.deepEqual((await audit.checkpoints!.verify('default')).problems.map(problem => problem.reason), ['stale'], 'no checkpoint for more than two days is a problem');
});

test('signing in with a Kubernetes service account token renews after a refused request', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'unfold-bao-'));
  const jwt = randomBytes(24).toString('base64url');
  await writeFile(join(dir, 'token'), `${jwt}\n`);
  const transit = await fakeTransit({ role: 'unfold-audit', jwt });
  t.after(async () => { await transit.close(); await rm(dir, { recursive: true, force: true }); });
  const settings = auditSettings({ openbao: { address: transit.url, role: 'unfold-audit', jwtPath: join(dir, 'token') } }, {});
  assert.deepEqual(settings.openbao?.auth, { kind: 'kubernetes', role: 'unfold-audit', mount: 'kubernetes', jwtPath: join(dir, 'token') });
  const store = new Store(':memory:');
  const audit = new AuditTrail({ store, settings, log: () => {} });
  audit.record({ fact: { kind: 'sign_in', method: 'password', user: ada, outcome: 'success' }, actor: { user: ada } });
  await audit.checkpoint();
  const [checkpoint] = audit.checkpoints!.local('default');
  assert.equal(transit.state.logins, 1);
  transit.tokens.clear();
  assert.equal(await audit.checkpoints!.signer!.verify(checkpointPayload(checkpoint), checkpoint.signature!), true, 'a revoked token is replaced by a new sign-in');
  assert.equal(transit.state.logins, 2);
  assert.equal(await audit.checkpoints!.signer!.verify(checkpointPayload({ ...checkpoint, sequence: 99 }), checkpoint.signature!), false);
  const local = await audit.checkpoints!.verify('default');
  assert.deepEqual([local.source, local.ok, local.checked], ['local', true, 1], 'without a bucket the checkpoints kept here are checked');
});

test('checkpoint settings: absent unless configured, secrets only from the environment', () => {
  const none = auditSettings(undefined, {});
  assert.deepEqual([none.openbao, none.checkpointStorage], [undefined, undefined]);
  assert.equal(new AuditTrail({ store: new Store(':memory:'), settings: none }).checkpoints, undefined, 'nothing is checkpointed without a signer or a bucket');
  assert.throws(() => auditSettings({ openbao: { address: 'https://bao.example.test', token: 'x' } }, {}), /UNFOLD_AUDIT_OPENBAO_TOKEN from a secret/);
  assert.throws(() => auditSettings({ openbao: { address: 'https://bao.example.test' } }, {}), /UNFOLD_AUDIT_OPENBAO_TOKEN or UNFOLD_AUDIT_OPENBAO_ROLE/);
  assert.throws(() => auditSettings(undefined, { UNFOLD_AUDIT_OPENBAO_ROLE: 'unfold' }), /UNFOLD_AUDIT_OPENBAO_ADDR/);
  assert.throws(() => auditSettings({ checkpoints: { url: 'https://s3.example.test/bucket', secretAccessKey: 'x' } }, {}), /from a secret/);
  assert.throws(() => auditSettings({ checkpoints: { url: 'https://s3.example.test/bucket' } }, {}), /ACCESS_KEY_ID and/);
  assert.throws(() => auditSettings({ checkpoints: { url: 'https://user:pw@s3.example.test/bucket' } }, { UNFOLD_AUDIT_CHECKPOINT_ACCESS_KEY_ID: 'a', UNFOLD_AUDIT_CHECKPOINT_SECRET_ACCESS_KEY: 'b' }), /without credentials/);
  const storage = auditSettings({ checkpoints: { url: 'https://s3.example.test/bucket', region: 'auto', prefix: 'audit/unfold' } }, { UNFOLD_AUDIT_CHECKPOINT_ACCESS_KEY_ID: 'a', UNFOLD_AUDIT_CHECKPOINT_SECRET_ACCESS_KEY: 'b' }).checkpointStorage;
  assert.deepEqual(storage, { url: 'https://s3.example.test/bucket', region: 'auto', prefix: 'audit/unfold', accessKeyId: 'a', secretAccessKey: 'b' });
});

test('GET /api/admin/audit/verify checks the newest stored checkpoint, or every one with checkpoints=all', async t => {
  const token = randomBytes(12).toString('hex');
  const transit = await fakeTransit({ token });
  const bucket = await fakeBucket(credentials);
  t.after(async () => { await transit.close(); await bucket.close(); });
  const app = await application('live', config => {
    config.audit = auditSettings(undefined, { UNFOLD_AUDIT_OPENBAO_ADDR: transit.url, UNFOLD_AUDIT_OPENBAO_TOKEN: token, UNFOLD_AUDIT_CHECKPOINT_URL: bucket.url, UNFOLD_AUDIT_CHECKPOINT_REGION: credentials.region, UNFOLD_AUDIT_CHECKPOINT_ACCESS_KEY_ID: credentials.accessKeyId, UNFOLD_AUDIT_CHECKPOINT_SECRET_ACCESS_KEY: credentials.secretAccessKey });
  });
  t.after(() => app.close());
  const admin = await login(app.url);
  const deadline = Date.now() + 10_000;
  while (bucket.objects.size === 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(bucket.objects.size, 1, 'the start-up run checkpoints the default Tenant');
  const verified = await request(app.url, '/api/admin/audit/verify?checkpoints=all', { cookie: admin.cookie });
  assert.deepEqual([verified.status, verified.body.ok, verified.body.checkpoints.source, verified.body.checkpoints.checked, verified.body.checkpoints.problems], [200, true, 'object_storage', 1, []]);
  bucket.objects.set([...bucket.objects.keys()][0], { body: '{"type":"unfold.audit.checkpoint","sequence":1,"head_hash":"00","time":"2026-10-30T00:00:00Z","tenant":"default","chain_uid":"unfold-audit:default","signature":"vault:v1:AAAA"}', headers: {} });
  const broken = await request(app.url, '/api/admin/audit/verify', { cookie: admin.cookie });
  assert.deepEqual([broken.body.ok, broken.body.checkpoints.problems.map((problem: { reason: string }) => problem.reason)], [false, ['bad_signature', 'hash_mismatch']]);
});
