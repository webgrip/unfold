import { randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { DockerClient, demultiplex } from './runtime/docker.ts';
import { digest, type DeliveryPolicy, type DeliveryCheck } from './delivery-config.ts';
import { deliveryFailure, type CanonicalCandidate } from './trusted-candidate.ts';

export type CheckResult = { id: string; passed: boolean; exitCode: number | null; stdoutSha256: string; stderrSha256: string; reason?: string };
export type VerificationResult = { verifierId: 'de-vloer-docker-v1'; passed: boolean; testCount: number; evidenceSha256: string; checks: CheckResult[] };

export function verifierSpec(candidate: CanonicalCandidate, policy: DeliveryPolicy, check: DeliveryCheck): Record<string, unknown> {
  return { Image: policy.image, Entrypoint: [], Cmd: check.argv, WorkingDir: '/candidate', User: '65532:65532', Env: ['HOME=/tmp', 'TMPDIR=/tmp', 'LANG=C.UTF-8'], Labels: { 'dev.webgrip.de-vloer/purpose': 'verifier', 'dev.webgrip.de-vloer/candidate': candidate.canonicalSha, 'dev.webgrip.de-vloer/policy': candidate.policySha }, HostConfig: { Binds: [`${candidate.directory}:/candidate:ro`, `${join(dirname(candidate.directory), 'policy')}:/policy:ro`], ReadonlyRootfs: true, NetworkMode: 'none', CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges:true'], Tmpfs: { '/tmp': 'rw,nosuid,nodev,noexec,size=64m,mode=1777' }, Memory: 512 * 1024 * 1024, MemorySwap: 512 * 1024 * 1024, NanoCpus: 1e9, PidsLimit: 64, RestartPolicy: { Name: 'no' }, AutoRemove: false, LogConfig: { Type: 'local', Config: { 'max-size': '1m', 'max-file': '2' } } } };
}

export async function verifyCandidate(candidate: CanonicalCandidate, policy: DeliveryPolicy, client = new DockerClient()): Promise<VerificationResult> {
  if (!policy.checks.length) deliveryFailure('zero_checks');
  const image = await client.request(`/images/${encodeURIComponent(policy.image)}/json`);
  if (policy.image.startsWith('sha256:') ? image.Id !== policy.image : !image.RepoDigests?.includes(policy.image)) deliveryFailure('image_digest_mismatch');
  const checks: CheckResult[] = [];
  for (const check of policy.checks) {
    const name = `vloer-verify-${randomBytes(12).toString('hex')}`;
    let result: CheckResult = { id: check.id, passed: false, exitCode: null, stdoutSha256: digest(''), stderrSha256: digest(''), reason: 'verification_unconfirmed' };
    try {
      await client.request(`/containers/create?name=${name}`, 'POST', verifierSpec(candidate, policy, check));
      await client.request(`/containers/${name}/start`, 'POST');
      const waited = await client.request(`/containers/${name}/wait?condition=not-running`, 'POST', undefined, false, policy.timeoutMs);
      const inspected = await client.request(`/containers/${name}/json`);
      if (inspected.State?.Running !== false || inspected.State?.OOMKilled || inspected.State?.Error || !Number.isInteger(waited.StatusCode) || waited.StatusCode !== inspected.State?.ExitCode) deliveryFailure('container_exit_unconfirmed');
      const raw = await client.raw(`/containers/${name}/logs?stdout=1&stderr=1`, 'GET');
      const logs = demultiplex(raw ?? Buffer.alloc(0));
      const passed = waited.StatusCode === check.exitCode && logs.stdout === check.stdout;
      result = { id: check.id, passed, exitCode: waited.StatusCode, stdoutSha256: digest(logs.stdout), stderrSha256: digest(logs.stderr), ...(passed ? {} : { reason: 'assertion_failed' }) };
    } catch { result.reason = 'verification_unconfirmed'; }
    finally { try { await client.request(`/containers/${name}?force=1&v=1`, 'DELETE', undefined, true); } catch { result.passed = false; result.reason = 'cleanup_unconfirmed'; } }
    checks.push(result);
  }
  return { verifierId: 'de-vloer-docker-v1', passed: checks.length === policy.checks.length && checks.every(check => check.passed), testCount: checks.filter(check => check.exitCode !== null).length, evidenceSha256: digest(JSON.stringify({ canonicalSha: candidate.canonicalSha, policySha: candidate.policySha, checks })), checks };
}
