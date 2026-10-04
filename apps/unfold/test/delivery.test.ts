import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalizeCandidate, deliveryGit } from '../src/trusted-candidate.ts';
import { policyDigest, validateDeliveryConfig } from '../src/delivery-config.ts';
import { verifierSpec, verifyCandidate } from '../src/delivery-verifier.ts';
import { deliveryFixture } from './delivery-fixture.ts';
import { DockerClient } from '../src/runtime/docker.ts';
import type { AppConfig } from '../src/types.ts';
import type { Session } from '../src/types.ts';
import { DeliveryService, validatedDelivery } from '../src/delivery.ts';
import { Store } from '../src/store.ts';

test('canonical delivery preserves the approved ancestry and complete binary tree; replay is deterministic', async () => {
  const f = await deliveryFixture();
  try {
    await f.fix(); await writeFile(join(f.repository, 'binary.dat'), Buffer.from([0, 255, 1, 44]));
    assert.equal((await f.capture('canonical')).status, 'ready');
    const candidate = await canonicalizeCandidate(f.dataDir, 'canonical', f.policy);
    assert.equal((await deliveryGit(candidate.gitDirectory, ['rev-parse', candidate.canonicalSha + '^'])).toString().trim(), f.policy.approvedBaseSha);
    assert.deepEqual(await readFile(join(candidate.directory, 'binary.dat')), Buffer.from([0, 255, 1, 44]));
    assert.deepEqual(await canonicalizeCandidate(f.dataDir, 'canonical', f.policy), candidate);
  } finally { await f.cleanup(); }
});

test('canonical delivery rejects modified protected policy input and a forged manifest tree', async () => {
  const f = await deliveryFixture();
  try {
    await f.fix(); await writeFile(join(f.repository, 'test-policy.txt'), 'silently weaken checks\n'); await f.capture('changed-policy');
    await assert.rejects(canonicalizeCandidate(f.dataDir, 'changed-policy', f.policy), { code: 'protected_input_changed' });
    const path = join(f.dataDir, 'candidates', 'changed-policy', 'manifest.json'); const manifest = JSON.parse(await readFile(path, 'utf8')); manifest.treeSha = manifest.baseSha; await writeFile(path, JSON.stringify(manifest));
    await assert.rejects(canonicalizeCandidate(f.dataDir, 'changed-policy', f.policy), { code: 'tree_identity_mismatch' });
  } finally { await f.cleanup(); }
});

test('policy fingerprint changes with acceptance criteria; empty checks and agent-exposed verifier credentials are rejected', async () => {
  const f = await deliveryFixture();
  try {
    assert.notEqual(policyDigest(f.policy), policyDigest({ ...f.policy, checks: [{ ...f.policy.checks[0], stdout: 'anything' }] }));
    const config = { dataDir: f.dataDir, repositories: [{ id: 'prices' }], execution: { team: 'silver' }, ploeg: { tokenEnv: 'EXECUTOR_TOKEN' }, runtime: { agentEnvironment: [] } } as unknown as AppConfig;
    const raw = { verifierTokenEnv: 'VERIFIER_TOKEN', policies: [f.policy] };
    assert.ok(validateDeliveryConfig(raw, config));
    assert.throws(() => validateDeliveryConfig({ ...raw, policies: [{ ...f.policy, checks: [] }] }, config));
    config.runtime.agentEnvironment = ['VERIFIER_TOKEN']; assert.throws(() => validateDeliveryConfig(raw, config));
  } finally { await f.cleanup(); }
});

test('verifier uses isolated fresh containers and real exit status, never accepts fake PASS output', async () => {
  const f = await deliveryFixture();
  try {
    await f.fix(); await f.capture('verifier'); const candidate = await canonicalizeCandidate(f.dataDir, 'verifier', f.policy);
    const spec = verifierSpec(candidate, f.policy, f.policy.checks[0]) as any;
    assert.equal(spec.HostConfig.NetworkMode, 'none'); assert.equal(spec.User, '65532:65532'); assert.ok(spec.HostConfig.Binds.every((value: string) => value.endsWith(':ro'))); assert.equal(spec.Env.some((value: string) => /TOKEN|KEY|OPENCODE/.test(value)), false);
    class FakeDocker extends DockerClient {
      async request(path: string): Promise<any> { if (path.startsWith('/images/')) return { Id: f.policy.image }; if (path.endsWith('/json')) return { State: { Running: false, ExitCode: 1 } }; if (path.includes('/wait')) return { StatusCode: 1 }; return {}; }
      async raw(): Promise<Buffer> { return Buffer.from('36\n'); }
    }
    const result = await verifyCandidate(candidate, f.policy, new FakeDocker());
    assert.equal(result.passed, false); assert.equal(result.testCount, 2); assert.ok(result.checks.every(check => check.exitCode === 1 && !check.passed));
    await assert.rejects(verifyCandidate(candidate, { ...f.policy, checks: [] }, new FakeDocker()), { code: 'zero_checks' });
  } finally { await f.cleanup(); }
});

test('delivery reads reject malformed or cross-execution identities before rendering', () => {
  const session = { repositoryId: 'prices', execution: { id: 'a'.repeat(32), workItemId: '1' } } as Session;
  const candidate = { id: 'b'.repeat(32), executionId: 'a'.repeat(32), workItemId: '1', repositoryId: 'prices', generation: 1, canonicalSha: 'a'.repeat(40), baseSha: 'b'.repeat(40), treeSha: 'c'.repeat(40), policySha256: 'd'.repeat(64), artifactSha256: 'e'.repeat(64) };
  assert.equal(validatedDelivery({ candidate }, session).candidate.canonicalSha, candidate.canonicalSha);
  assert.throws(() => validatedDelivery({ candidate: { ...candidate, canonicalSha: { malicious: true } } }, session), { code: 'delivery_contract' });
  assert.throws(() => validatedDelivery({ candidate: { ...candidate, workItemId: '2' } }, session), { code: 'delivery_contract' });
  const receipt = { id: 'c'.repeat(32), candidateId: candidate.id, policySha256: candidate.policySha256, canonicalSha: candidate.canonicalSha, treeSha: candidate.treeSha, artifactSha256: candidate.artifactSha256, passed: true, testCount: 2, evidenceSha256: 'f'.repeat(64) };
  const approval = { id: 'd'.repeat(32), candidateId: candidate.id, receiptId: receipt.id, policySha256: candidate.policySha256, actor: 'owner' };
  const operation = { id: 'publication-one', executionId: candidate.executionId, candidateId: candidate.id, receiptId: receipt.id, approvalId: approval.id, canonicalSha: candidate.canonicalSha, state: 'unknown' };
  assert.equal(validatedDelivery({ candidate, receipt, approval, operation }, session).operation.id, 'publication-one');
});

test('delivery approval rejects a replaced local policy and enforces owner and viewer authorization', async () => {
  const f = await deliveryFixture(); const store = new Store(':memory:');
  try {
    const owner = { id: 'owner', name: 'Owner', role: 'operator' as const };
    const session = { id: 'approval-policy', repositoryId: 'prices', ownerId: owner.id, updatedAt: new Date().toISOString(), execution: { id: 'a'.repeat(32), workItemId: '1' } } as Session; store.saveSession(session);
    const config = { dataDir: f.dataDir, repositories: [{ id: 'prices' }], execution: { team: 'delivery' }, ploeg: { url: 'http://127.0.0.1:1', tokenEnv: 'EXECUTOR_TOKEN', userTeams: { owner: ['delivery'] } }, runtime: { agentEnvironment: [] }, delivery: { verifierTokenEnv: 'VERIFIER_TOKEN', policies: [f.policy] } } as unknown as AppConfig;
    const service = new DeliveryService(config, store);
    await assert.rejects(service.approve(session.id, owner, { candidateId: 'b'.repeat(32), receiptId: 'c'.repeat(32), policySha256: 'd'.repeat(64) }), { code: 'delivery_policy_changed' });
    await assert.rejects(service.approve(session.id, { ...owner, role: 'viewer' }, {}), { status: 403 });
    await assert.rejects(service.view(session.id, { ...owner, id: 'outsider' }), { status: 404 });
    config.delivery = undefined;
    await assert.rejects(service.approve(session.id, owner, { policySha256: policyDigest(f.policy) }), { code: 'delivery_policy_changed' });
  } finally { store.close(); await f.cleanup(); }
});
