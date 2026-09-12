import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { captureLocalCandidate } from '../src/candidates.ts';
import { digest, type DeliveryPolicy } from '../src/delivery-config.ts';

export async function deliveryFixture() {
  const root = await mkdtemp(join(tmpdir(), 'vloer-delivery-')); const repository = join(root, 'repository'); const dataDir = join(root, 'data'); const policyDirectory = join(root, 'policy');
  await mkdir(repository); await mkdir(policyDirectory);
  const git = (...args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', ...args], { cwd: repository, env: { PATH: process.env.PATH, HOME: root, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@localhost', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@localhost' }, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  git('init', '-b', 'main');
  await writeFile(join(repository, 'price.mjs'), 'export const total = (price, count) => price + count;\n');
  await writeFile(join(repository, 'test-policy.txt'), 'approved acceptance contract\n');
  git('add', 'price.mjs', 'test-policy.txt'); git('commit', '-m', 'Initial regression fixture');
  const baseSha = git('rev-parse', 'HEAD'); const approvedBaseBundle = join(root, 'approved.bundle'); git('bundle', 'create', approvedBaseBundle, '--all');
  const policyFile = 'import { total } from "/candidate/price.mjs";\nconsole.log(JSON.stringify(total(Number(process.argv[2]), Number(process.argv[3]))));\n';
  await writeFile(join(policyDirectory, 'check.mjs'), policyFile);
  const policy: DeliveryPolicy = { repositoryId: 'prices', approvedBaseSha: baseSha, approvedBaseBundle, image: 'sha256:' + '1'.repeat(64), directory: policyDirectory, files: { 'check.mjs': digest(policyFile) }, protectedPaths: ['test-policy.txt'], checks: [{ id: 'multiply', argv: ['/usr/local/bin/node', '/policy/check.mjs', '12', '3'], stdout: '36\n', exitCode: 0 }, { id: 'zero', argv: ['/usr/local/bin/node', '/policy/check.mjs', '12', '0'], stdout: '0\n', exitCode: 0 }], timeoutMs: 5000 };
  const capture = (sessionId: string) => captureLocalCandidate({ dataDir, sessionId, repositoryId: 'prices', directory: repository, baseSha });
  const fix = () => writeFile(join(repository, 'price.mjs'), 'export const total = (price, count) => price * count;\n');
  return { root, repository, dataDir, policy, git, capture, fix, cleanup: () => rm(root, { recursive: true, force: true }) };
}
