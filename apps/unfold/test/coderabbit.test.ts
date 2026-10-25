import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setImmediate } from 'node:timers/promises';
import { validateCodeRabbitConfig, type CodeRabbitRepository } from '../src/coderabbit-config.ts';
import { fetchCodeRabbitSecurity, parseCodeRabbitReview, runCodeRabbitReview, type CodeRabbitProvider, type CodeRabbitReview } from '../src/coderabbit-provider.ts';
import { CodeRabbitService } from '../src/coderabbit.ts';
import { knownSecrets } from '../src/redaction.ts';
import { Store } from '../src/store.ts';
import type { AppConfig, Session } from '../src/types.ts';

const headSha = 'a'.repeat(40);
const repository: CodeRabbitRepository = { repositoryId: 'prices', github: 'fixture/prices', base: 'main', region: 'eu', agenticKeyEnv: 'CR_REVIEW_FIXTURE', security: { keyEnv: 'CR_SECURITY_FIXTURE', repositoryId: '123', organizationId: '456' } };
const owner = { id: 'owner', name: 'Owner', role: 'operator' as const };
const context = { type: 'review_context', remote: repository.github, currentBranch: headSha, baseBranch: 'main' };
const finding = { type: 'finding', severity: 'major', fileName: 'price.ts', title: 'Wrong total', comment: 'Review this total.', codegenInstructions: 'Use multiplication.', startLine: 2, endLine: 3 };
const complete = { type: 'complete', status: 'review_completed', findings: 1 };
const stream = (...events: unknown[]) => events.map(event => JSON.stringify(event)).join('\n') + '\n';
const review: CodeRabbitReview = { state: 'completed', findings: [], reused: false };
function config(): AppConfig {
  return { mode: 'live', repositories: [{ id: 'prices' }], execution: { team: 'delivery' }, ploeg: { url: 'http://127.0.0.1:1', tokenEnv: 'PLOEG_TOKEN', userTeams: { owner: ['delivery'] } }, runtime: { agentEnvironment: [] }, auth: {}, coderabbit: { cli: { binary: '/opt/coderabbit', sha256: 'b'.repeat(64), timeoutMs: 1200000 }, dailyReviewLimit: 2, repositories: [repository] } } as unknown as AppConfig;
}
function fixture(provider: CodeRabbitProvider) {
  const store = new Store(':memory:'); const settings = config();
  const session = { id: 'review-session', repositoryId: 'prices', ownerId: owner.id, updatedAt: new Date().toISOString(), execution: { id: 'execution-one' } } as Session;
  store.saveSession(session);
  process.env.CR_REVIEW_FIXTURE = 'fixture-review-credential'; process.env.CR_SECURITY_FIXTURE = 'fixture-security-credential';
  return { store, settings, session, service: new CodeRabbitService(settings, store, provider), close() { store.close(); delete process.env.CR_REVIEW_FIXTURE; delete process.env.CR_SECURITY_FIXTURE; } };
}

test('configuration rejects unknown repositories, shared control credentials, demo execution, unpinned binaries and excessive limits', () => {
  const c = config(); const valid = c.coderabbit!;
  assert.deepEqual(validateCodeRabbitConfig(valid, c), valid);
  for (const raw of [{ ...valid, dailyReviewLimit: 0 }, { ...valid, cli: { ...valid.cli, binary: 'coderabbit' } }, { ...valid, cli: { ...valid.cli, sha256: 'latest' } }, { ...valid, cli: { ...valid.cli, timeoutMs: 1 } }, { ...valid, unknown: true }, { ...valid, repositories: [{ ...repository, repositoryId: 'another' }] }, { ...valid, repositories: [{ ...repository, github: '--remote' }] }, { ...valid, repositories: [{ ...repository, agenticKeyEnv: 'PLOEG_TOKEN' }] }, { ...valid, repositories: [{ ...repository, security: { ...repository.security, keyEnv: repository.agenticKeyEnv } }] }]) assert.throws(() => validateCodeRabbitConfig(raw, c));
  assert.throws(() => validateCodeRabbitConfig(valid, { ...c, mode: 'demo' }));
  assert.throws(() => validateCodeRabbitConfig(valid, { ...c, runtime: { ...c.runtime, agentEnvironment: ['CR_SECURITY_FIXTURE'] } }));
  assert.equal(validateCodeRabbitConfig(undefined, c), undefined);
});

test('review completion requires matching scope, an exit code, a terminal result, matching finding counts and complete coverage', () => {
  assert.equal(parseCodeRabbitReview(stream(context, finding, complete), 0, repository, headSha).state, 'completed');
  assert.equal(parseCodeRabbitReview(stream(context, { ...complete, findings: 0, reused: true }), 0, repository, headSha).reused, true);
  for (const terminal of [{ ...complete, outcome: 'failed' }, { ...complete, unreviewedFileCount: 1 }, { ...complete, outcome: 'new_unknown_status' }, { ...complete, findings: 2 }, { ...complete, status: 'review_skipped' }]) assert.equal(parseCodeRabbitReview(stream(context, finding, terminal), 0, repository, headSha).state, 'incomplete');
  assert.equal(parseCodeRabbitReview(stream(context, finding, complete), 1, repository, headSha).state, 'incomplete');
  assert.equal(parseCodeRabbitReview(stream(context, finding), 0, repository, headSha).state, 'incomplete');
  assert.equal(parseCodeRabbitReview(stream(context, finding, { type: 'error' }, complete), 0, repository, headSha).state, 'incomplete');
  assert.equal(parseCodeRabbitReview(stream(context, { ...complete, findings: 0, status: 'review_skipped' }), 0, repository, headSha).state, 'skipped');
  assert.equal(parseCodeRabbitReview(stream(context, finding, { ...complete, outcome: 'completed_with_warnings', unreviewedFileCount: 0 }), 0, repository, headSha).state, 'completed');
  assert.throws(() => parseCodeRabbitReview(stream({ ...context, remote: 'another/client' }, finding, complete), 0, repository, headSha));
  assert.throws(() => parseCodeRabbitReview(stream({ ...context, currentBranch: 'main' }, finding, complete), 0, repository, headSha));
  assert.throws(() => parseCodeRabbitReview(stream(context, finding, complete, finding), 0, repository, headSha));
  assert.throws(() => parseCodeRabbitReview('not JSON', 0, repository, headSha));
});

test('headless runner verifies the binary, isolates auth files and environment, passes pinned scope and removes its home', async t => {
  const root = await mkdtemp(join(tmpdir(), 'coderabbit-runner-')); t.after(() => rm(root, { recursive: true, force: true }));
  const capture = join(root, 'capture.json'); const binary = join(root, 'coderabbit');
  const source = `#!${process.execPath}\nconst fs = require('node:fs'); const args = process.argv.slice(2); if(args[0] === 'auth') process.exit(0); fs.writeFileSync(${JSON.stringify(capture)}, JSON.stringify({args, env: process.env, cwd: process.cwd()})); process.stdout.write(${JSON.stringify(stream(context, finding, complete))});\n`;
  await writeFile(binary, source, { mode: 0o700 });
  const cli = { binary, sha256: createHash('sha256').update(source).digest('hex'), timeoutMs: 3000 };
  process.env.UNFOLD_TEST_OPERATOR_SECRET = 'operator-secret'; t.after(() => { delete process.env.UNFOLD_TEST_OPERATOR_SECRET; });
  assert.equal((await runCodeRabbitReview(cli, repository, headSha, 'fixture-review-credential', new AbortController().signal)).state, 'completed');
  const captured = JSON.parse(await readFile(capture, 'utf8'));
  assert.deepEqual(captured.args, ['review', '--remote', 'fixture/prices', '--base', 'main', '--source-branch', headSha, '--agent']);
  assert.equal(captured.env.UNFOLD_TEST_OPERATOR_SECRET, undefined); assert.equal(captured.env.CR_REVIEW_FIXTURE, undefined);
  await assert.rejects(readFile(join(captured.cwd, 'any')), { code: 'ENOENT' });
  await assert.rejects(runCodeRabbitReview({ ...cli, sha256: '0'.repeat(64) }, repository, headSha, 'key', new AbortController().signal), /digest/);
  await assert.rejects(runCodeRabbitReview(cli, repository, headSha, 'key', AbortSignal.abort()), /abort/i);
  const hanging = `#!${process.execPath}\nif(process.argv[2] === 'auth') process.exit(0); setInterval(() => {}, 1000);\n`;
  await writeFile(binary, hanging, { mode: 0o700 });
  await assert.rejects(runCodeRabbitReview({ binary, sha256: createHash('sha256').update(hanging).digest('hex'), timeoutMs: 100 }, repository, headSha, 'key', new AbortController().signal), /timeout/);
});

test('security pagination uses read-only scoped requests, preserves provenance and rejects foreign rows and repeated cursors', async () => {
  const row = { id: 'finding-1', repository_id: '123', organization_id: '456', severity: 'high', state: 'open', file_path: 'price.ts', description: 'Inspect input.', scan_provenance: { scanId: 'scan-1', scope: { primary: { repositoryId: '123', revision: headSha }, selectedContext: [{ repositoryId: 'another-client' }] }, evidenceStatus: 'not_loaded' } };
  const calls: URL[] = [];
  const request = (async (url: URL, options: RequestInit) => { calls.push(url); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error'); assert.equal((options.headers as any)['x-coderabbitai-api-key'], 'security-key'); return Response.json(calls.length === 1 ? { data: [row], next_cursor: 'next-page' } : { data: [], next_cursor: null }); }) as typeof fetch;
  const result = await fetchCodeRabbitSecurity(repository, 'security-key', new AbortController().signal, request);
  assert.equal(calls.length, 2); assert.equal(calls[0].searchParams.get('repo_id'), '123'); assert.equal(calls[1].searchParams.get('cursor'), 'next-page');
  assert.deepEqual(result[0].provenance, { scanId: 'scan-1', revision: headSha, evidenceStatus: 'not_loaded' });
  assert.equal(JSON.stringify(result).includes('another-client'), false);
  for (const changed of [{ ...row, repository_id: '999' }, { ...row, organization_id: '999' }, { ...row, scan_provenance: { scope: { primary: { repositoryId: '999' } } } }]) await assert.rejects(fetchCodeRabbitSecurity(repository, 'key', new AbortController().signal, (async () => Response.json({ data: [changed], next_cursor: null })) as typeof fetch));
  await assert.rejects(fetchCodeRabbitSecurity(repository, 'key', new AbortController().signal, (async () => Response.json({ data: [], next_cursor: 'repeat' })) as typeof fetch));
  await assert.rejects(fetchCodeRabbitSecurity(repository, 'key', new AbortController().signal, (async () => Response.json({ data: [] })) as typeof fetch));
  await assert.rejects(fetchCodeRabbitSecurity(repository, 'key', new AbortController().signal, (async () => new Response('denied', { status: 403 })) as typeof fetch), /HTTP 403/);
});

test('review requests are authorized, idempotent, durable, quota-limited and never change delivery acceptance or spend', async () => {
  let calls = 0;
  const f = fixture({ review: async () => { calls++; return review; }, security: async () => [] });
  try {
    const data = { requestId: 'request-0000000001', headSha, acceptProviderBilling: true };
    assert.throws(() => f.service.view(f.session.id, { ...owner, id: 'outsider' }), { status: 404 });
    assert.throws(() => f.service.startReview(f.session.id, { ...owner, role: 'viewer' }, data), { status: 403 });
    assert.throws(() => f.service.startReview(f.session.id, owner, { ...data, acceptProviderBilling: false }), { status: 400 });
    assert.equal(f.service.startReview(f.session.id, owner, data).reviews[0].state, 'running');
    f.service.startReview(f.session.id, owner, data);
    await setImmediate();
    assert.equal(calls, 1); assert.equal(f.service.view(f.session.id, owner).reviews[0].state, 'completed');
    f.service.startReview(f.session.id, owner, data); assert.equal(calls, 1);
    assert.throws(() => f.service.startReview(f.session.id, owner, { ...data, headSha: 'b'.repeat(40) }), { status: 409 });
    f.service.startReview(f.session.id, owner, { ...data, requestId: 'request-0000000002' }); await setImmediate();
    assert.throws(() => f.service.startReview(f.session.id, owner, { ...data, requestId: 'request-0000000003' }), { status: 429 });
    assert.equal(calls, 2); assert.equal(JSON.stringify(f.store.getSession(f.session.id)), JSON.stringify(f.session));
    assert.equal(f.store.events(f.session.id).filter(event => event.type === 'coderabbit.review_requested').length, 2);
  } finally { f.close(); }
});

test('cancellation and restart never retry provider work, and a late response cannot replace cancellation', async () => {
  let finish!: (review: CodeRabbitReview) => void; let calls = 0;
  const provider = { review: () => { calls++; return new Promise<CodeRabbitReview>(resolve => { finish = resolve; }); }, security: async () => [] };
  const f = fixture(provider);
  try {
    const data = { requestId: 'request-0000000001', headSha, acceptProviderBilling: true };
    f.service.startReview(f.session.id, owner, data);
    f.service.cancelReview(f.session.id, owner, data.requestId); finish(review); await setImmediate();
    assert.equal(f.service.view(f.session.id, owner).reviews[0].state, 'cancelled');
    f.service.startReview(f.session.id, owner, { ...data, requestId: 'request-0000000002' });
    f.service.stop();
    const restarted = new CodeRabbitService(f.settings, f.store, provider);
    assert.equal(restarted.view(f.session.id, owner).reviews[0].state, 'interrupted');
    assert.equal(calls, 2); finish(review); await setImmediate();
    assert.equal(restarted.view(f.session.id, owner).reviews[0].state, 'interrupted');
  } finally { f.close(); }
});

test('stored findings redact configured credentials and failed imports preserve the last complete snapshot', async () => {
  let fail = false;
  const f = fixture({ review: async () => ({ ...review, findings: [{ severity: 'major', fileName: 'x', title: '', comment: 'fixture-review-credential', codegenInstructions: 'fixture-security-credential' }] }), security: async () => { if (fail) throw new Error('fixture-security-credential'); return []; } });
  try {
    assert(knownSecrets(f.settings).includes('fixture-review-credential'));
    f.service.startReview(f.session.id, owner, { requestId: 'request-0000000001', headSha, acceptProviderBilling: true }); await setImmediate();
    assert.equal(JSON.stringify(f.service.view(f.session.id, owner)).includes('fixture-review-credential'), false);
    const first = await f.service.importSecurity(f.session.id, owner); fail = true;
    await assert.rejects(f.service.importSecurity(f.session.id, owner), { code: 'coderabbit_import' });
    assert.deepEqual(f.service.view(f.session.id, owner).security, first.security);
  } finally { f.close(); }
});
