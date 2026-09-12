import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SigningKey, candidateStatement, changedLineRanges, pae, verifyEnvelope, candidatePredicateType, tracePredicateType } from '../src/attestations.ts';
import { application, createSession, request, sessionUntil } from './api-support.ts';
import { fixture } from './task-binding-support.ts';

test('DSSE envelopes use the in-toto payload type, the PAE encoding and verify only with the matching Ed25519 key', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vloer-attest-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const key = SigningKey.load(directory);
  const again = SigningKey.load(directory);
  assert.equal(again.id, key.id, 'the key is stable across loads');
  const envelope = key.sign({ _type: 'https://in-toto.io/Statement/v1', subject: [], predicateType: 'https://example/test', predicate: { ok: true } });
  assert.equal(envelope.payloadType, 'application/vnd.in-toto+json');
  assert.equal(envelope.signatures[0].keyid, key.id);
  assert.equal(verifyEnvelope(envelope, key.publicPem()).valid, true);
  assert.equal(verifyEnvelope({ ...envelope, payload: Buffer.from('{"tampered":true}').toString('base64') }, key.publicPem()).valid, false);
  const other = SigningKey.load(join(directory, 'other'));
  assert.equal(verifyEnvelope(envelope, other.publicPem()).valid, false);
  assert.equal(pae('t', Buffer.from('ab')).toString(), 'DSSEv1 1 t 2 ab');
  assert.deepEqual([...changedLineRanges('diff --git a/x.js b/x.js\n@@ -1,2 +1,5 @@\n+a\ndiff --git a/y.md b/y.md\n@@ -0,0 +1 @@\n+b\n@@ -10,3 +12,4 @@\n')].map(([path, range]) => [path, range.endLine]), [['x.js', 5], ['y.md', 15]]);
});

test('a captured candidate ships a signed provenance statement and an Agent Trace record that verify against the published key', { timeout: 40_000 }, async t => {
  const server = await application();
  t.after(() => server.close());
  const created = await createSession(server.url);
  assert.equal((await request(server.url, `/api/sessions/${created.id}/start`, { method: 'POST' })).status, 200);
  const completed = await sessionUntil(server.url, created.id, session => ['completed', 'failed'].includes(session.status));
  assert.equal(completed.status, 'completed');
  assert.equal(completed.candidate?.status, 'ready');
  assert.ok(completed.candidate?.formats?.includes('attestation'));
  assert.deepEqual(completed.candidate?.attestation?.predicateTypes, [candidatePredicateType, tracePredicateType]);
  const publicKey = await fetch(`${server.url}/api/attestations/public-key`);
  assert.equal(publicKey.status, 200);
  assert.equal(publicKey.headers.get('x-key-id'), completed.candidate?.attestation?.keyId);
  const pem = await publicKey.text();
  const attestation = await request(server.url, `/api/sessions/${created.id}/candidate/download?format=attestation`);
  assert.equal(attestation.status, 200);
  const verified = verifyEnvelope(attestation.body, pem);
  assert.equal(verified.valid, true);
  const statement = verified.statement as any;
  assert.equal(statement.predicateType, candidatePredicateType);
  assert.equal(statement.predicate.candidate.headSha, completed.candidate?.headSha);
  assert.equal(statement.predicate.repository.baseSha, completed.candidate?.baseSha);
  assert.ok(statement.subject.some((subject: any) => subject.digest.gitCommit === completed.candidate?.headSha));
  assert.equal(statement.predicate.candidate.verification, 'not_performed');
  const trace = await request(server.url, `/api/sessions/${created.id}/candidate/download?format=trace`);
  const traceStatement = verifyEnvelope(trace.body, pem).statement as any;
  assert.equal(traceStatement.predicateType, tracePredicateType);
  assert.equal(traceStatement.predicate.version, '0.1.0');
  assert.equal(traceStatement.predicate.vcs.revision, completed.candidate?.headSha);
  assert.ok(traceStatement.predicate.files.length > 0);
  assert.ok(traceStatement.predicate.files.every((file: any) => file.conversations[0].ranges[0].end_line >= 1 && file.conversations[0].contributor.type === 'ai'));

  const directory = await mkdtemp(join(tmpdir(), 'vloer-verify-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const format of ['bundle', 'patch', 'manifest', 'attestation', 'trace']) {
    const response = await fetch(`${server.url}/api/sessions/${created.id}/candidate/download?format=${format}`);
    assert.equal(response.status, 200);
    const filename = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1];
    await writeFile(join(directory, filename!), Buffer.from(await response.arrayBuffer()));
  }
  await writeFile(join(directory, 'key.pub'), pem);
  const script = fileURLToPath(new URL('../scripts/verify-candidate.mjs', import.meta.url));
  const report = JSON.parse(execFileSync(process.execPath, [script, directory, join(directory, 'key.pub')], { encoding: 'utf8' }));
  assert.deepEqual(report.problems, []);
  assert.equal(report.results.every((result: any) => result.signatureValid), true);
  const patch = await readFile(join(directory, 'candidate.patch'));
  await writeFile(join(directory, 'candidate.patch'), Buffer.concat([patch, Buffer.from('\n')]));
  assert.throws(() => execFileSync(process.execPath, [script, directory, join(directory, 'key.pub')], { encoding: 'utf8', stdio: 'pipe' }), 'a modified patch must fail verification');
});

test('candidate provenance signs the canonical tracker binding independently from the preview hash', async t => {
  const f = await fixture(t);
  const session = await f.imported();
  const statement = candidateStatement({
    session, config: f.server.config, repository: f.server.config.repositories[0], version: 'test',
    bundle: Buffer.from('test bundle'), patch: Buffer.from('test patch'), manifestBytes: Buffer.from('{}'),
    manifest: { version: 1, sessionId: session.id, repositoryId: session.repositoryId, createdAt: session.createdAt, baseSha: 'a'.repeat(40), snapshotBaseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), treeSha: 'c'.repeat(40), history: 'synthetic_snapshot_commits', verification: 'not_performed', publication: 'not_performed', scope: 'base_and_index_tracked_plus_unignored_worktree', files: [], fileCount: 0, bytes: 0, downloads: { bundle: { filename: 'candidate.git.bundle', bytes: 0, sha256: '' }, patch: { filename: 'candidate.patch', bytes: 0, sha256: '' } } },
  });
  const key = f.server.app.engine.signing();
  const envelope = key.sign(statement);
  const verified = verifyEnvelope(envelope, key.publicPem());
  assert.equal(verified.valid, true);
  const source = (verified.statement as any).predicate.session.sourceTask;
  assert.deepEqual(source.ploeg, session.sourceTask!.ploeg);
  assert.equal(source.nativeRevision, session.sourceTask!.nativeRevision);
  assert.equal(source.bindingRevision, session.sourceTask!.bindingRevision);
  assert.notEqual(source.revision, source.nativeRevision);
  const altered = JSON.parse(Buffer.from(envelope.payload, 'base64').toString('utf8'));
  altered.predicate.session.sourceTask.ploeg.workItemId = '123';
  assert.equal(verifyEnvelope({ ...envelope, payload: Buffer.from(JSON.stringify(altered)).toString('base64') }, key.publicPem()).valid, false);
});
