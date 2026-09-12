import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DockerClient } from '../src/runtime/docker.ts';
import { canonicalizeCandidate } from '../src/trusted-candidate.ts';
import { verifyCandidate } from '../src/delivery-verifier.ts';
import { deliveryFixture } from '../test/delivery-fixture.ts';

const image = process.env.VLOER_VERIFIER_IMAGE;
if (!image || !/^(?:[a-zA-Z0-9._:/-]+@)?sha256:[a-f0-9]{64}$/.test(image)) throw new Error('Set VLOER_VERIFIER_IMAGE to an existing pinned image with /usr/local/bin/node.');
const f = await deliveryFixture(); const client = new DockerClient(process.env.VLOER_DOCKER_SOCKET);
try {
  f.policy.image = image;
  assert.equal((await f.capture('before-fix')).status, 'ready');
  const before = await canonicalizeCandidate(f.dataDir, 'before-fix', f.policy);
  const failing = await verifyCandidate(before, f.policy, client); assert.equal(failing.passed, false); assert.equal(failing.testCount, 2);
  await f.fix(); assert.equal((await f.capture('after-fix')).status, 'ready');
  const after = await canonicalizeCandidate(f.dataDir, 'after-fix', f.policy);
  const passing = await verifyCandidate(after, f.policy, client); assert.equal(passing.passed, true); assert.equal(passing.testCount, 2);
  await writeFile(join(f.repository, 'price.mjs'), 'console.log("36"); process.exit(1);\nexport const total = () => 36;\n');
  await f.capture('fake-pass'); const fake = await verifyCandidate(await canonicalizeCandidate(f.dataDir, 'fake-pass', f.policy), f.policy, client); assert.equal(fake.passed, false);
  const result = { at: new Date().toISOString(), qualification: 'real Git and fresh Docker containers; deterministic fixture; no model calls or external publication', image, approvedBaseSha: f.policy.approvedBaseSha, canonicalSha: after.canonicalSha, policySha256: after.policySha, beforeFix: failing, afterFix: passing, fakePass: fake, modelCalls: 0, spendUsd: 0 };
  if (process.env.VLOER_DELIVERY_EVIDENCE) { const path = resolve(process.env.VLOER_DELIVERY_EVIDENCE); await mkdir(path, { recursive: true }); await writeFile(join(path, 'docker-verification.json'), JSON.stringify(result, null, 2) + '\n'); }
  console.log(JSON.stringify(result, null, 2));
} finally { await f.cleanup(); }
