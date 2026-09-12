import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, symlink, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { AppConfig, Repository, Session, Workspace } from '../src/types.ts';
import { captureLocalCandidate, pinCandidateBase, readCandidate, persistRemoteCandidate, type CandidateManifest } from '../src/candidates.ts';


const registeredRepository: Repository = { id: 'fixture', name: 'Fixture', description: '', url: 'https://forge.invalid/fixture.git', baseBranch: 'main', verify: [] };
function candidateConfiguration(dataDir: string): AppConfig {
  return { mode: 'live', host: '127.0.0.1', port: 0, dataDir, publicDir: '', repositories: [registeredRepository], crews: [], models: [], runtime: { kind: 'opencode', backend: 'kubernetes', timeoutMs: 20000 }, auth: { secureCookies: false, sessionHours: 1, bootstrapName: 'operator' }, maxConcurrentSessions: 1, maxBudgetUsd: 1, kubernetes: { namespace: 'agents', image: 'test-image', storageSize: '1Gi', cpu: '1', memory: '512Mi' } };
}
function candidateSession(id: string, workspace: Workspace): Session {
  return { id, title: 'Candidate fixture', objective: 'Review fixture', repositoryId: registeredRepository.id, crewId: 'review', runtime: 'opencode', ownerId: 'operator', ownerName: 'Operator', status: 'exporting', budgetUsd: 1, spentUsd: 0, costStatus: 'pending', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(), branch: `vloer/${id}`, runs: [], artifacts: [], workspace };
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', ...args], { cwd, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: cwd, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'vloer-candidate-')); const directory = join(root, 'repo');
  await mkdir(directory); git(directory, 'init', '--initial-branch=main');
  await writeFile(join(directory, 'source.txt'), 'original\n'); await writeFile(join(directory, 'remove.txt'), 'delete me\n');
  await writeFile(join(directory, 'run.sh'), '#!/bin/sh\nexit 0\n'); await writeFile(join(directory, '.gitignore'), 'ignored.log\n');
  git(directory, 'add', '.'); git(directory, 'commit', '-m', 'base');
  return { root, directory, baseSha: await pinCandidateBase(directory), dataDir: join(root, 'state'), sessionId: 'session-one', repositoryId: 'fixture' };
}

test('candidate bundle and binary patch roundtrip full changes without changing source Git state', async () => {
  const options = await fixture();
  try {
    const indexBefore = await readFile(join(options.directory, '.git/index'));
    await writeFile(join(options.directory, 'source.txt'), 'changed\n'); await rm(join(options.directory, 'remove.txt'));
    await chmod(join(options.directory, 'run.sh'), 0o755); await writeFile(join(options.directory, 'binary.dat'), Buffer.from([0, 1, 255, 0, 128]));
    await writeFile(join(options.directory, 'new file\nline.txt'), 'untracked\n'); await writeFile(join(options.directory, 'ignored.log'), 'ignored output\n');
    await symlink('source.txt', join(options.directory, 'source-link'));
    const candidate = await captureLocalCandidate(options);
    assert.equal(candidate.status, 'ready', candidate.reason); assert.equal(candidate.baseSha, options.baseSha); assert.equal(candidate.fileCount, 6);
    assert.deepEqual(await readFile(join(options.directory, '.git/index')), indexBefore); assert.equal(git(options.directory, 'rev-parse', 'HEAD'), options.baseSha);
    const download = await readCandidate(options.dataDir, options.sessionId, 'bundle');
    const manifest = JSON.parse((await readCandidate(options.dataDir, options.sessionId, 'manifest')).content.toString()) as CandidateManifest;
    assert.equal(manifest.history, 'synthetic_snapshot_commits'); assert.equal(manifest.verification, 'not_performed');
    assert.equal(manifest.files.find(file => file.path === 'run.sh')?.mode, '100755');
    assert.equal(manifest.files.find(file => file.path === 'source-link')?.mode, '120000');
    assert.equal(manifest.files.find(file => file.path === 'remove.txt')?.status, 'deleted');
    assert.equal(manifest.files.some(file => file.path === 'ignored.log'), false);
    const bundlePath = join(options.root, 'candidate.bundle'); await writeFile(bundlePath, download.content);
    const clone = join(options.root, 'clone'); git(options.root, 'clone', bundlePath, clone);
    assert.deepEqual(await readFile(join(clone, 'binary.dat')), Buffer.from([0, 1, 255, 0, 128]));
    assert.equal(await readFile(join(clone, 'new file\nline.txt'), 'utf8'), 'untracked\n');
    assert.equal((await stat(join(clone, 'run.sh'))).mode & 0o111, 0o111);
    assert.equal(git(clone, 'rev-parse', 'HEAD'), candidate.headSha);
    assert.equal(git(clone, 'rev-list', '--count', 'HEAD'), '2');
    assert.match(git(clone, 'diff', 'origin/vloer-base', 'HEAD'), /changed/);
    git(clone, 'checkout', 'origin/vloer-base');
    const patch = await readCandidate(options.dataDir, options.sessionId, 'patch');
    const patchPath = join(options.root, 'candidate.patch'); await writeFile(patchPath, patch.content);
    git(clone, 'apply', '--index', '--binary', patchPath); assert.equal(git(clone, 'write-tree'), candidate.treeSha);
    await writeFile(join(options.directory, 'source.txt'), 'later edit\n');
    const repeated = await captureLocalCandidate(options); assert.deepEqual(repeated, candidate);
    assert.deepEqual((await readCandidate(options.dataDir, options.sessionId, 'bundle')).content, download.content);
    const copied = await persistRemoteCandidate(join(options.root, 'remote'), options.sessionId, manifest, download.content, patch.content);
    assert.deepEqual(copied, candidate);
  } finally { await rm(options.root, { recursive: true, force: true }); }
});

test('candidate capture ignores repository hooks, local configuration and content filters', async () => {
  const options = await fixture();
  try {
    const marker = join(options.root, 'hook-executed');
    await writeFile(join(options.directory, '.git/hooks/pre-commit'), `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o755 });
    git(options.directory, 'config', 'filter.attack.clean', `touch '${marker}'`);
    git(options.directory, 'config', 'core.fsmonitor', `touch '${marker}'`);
    git(options.directory, 'config', 'diff.external', `touch '${marker}'`);
    await writeFile(join(options.directory, '.gitattributes'), '*.txt filter=attack diff=attack\n');
    await writeFile(join(options.directory, 'source.txt'), 'literal filtered bytes\n');
    const candidate = await captureLocalCandidate(options); assert.equal(candidate.status, 'ready', candidate.reason);
    await assert.rejects(stat(marker), { code: 'ENOENT' });
    assert.match((await readCandidate(options.dataDir, options.sessionId, 'patch')).content.toString(), /literal filtered bytes/);
  } finally { await rm(options.root, { recursive: true, force: true }); }
});

test('candidate capture fails closed on sensitive new paths and tracked base secrets', async () => {
  for (const tracked of [false, true]) {
    const options = await fixture();
    try {
      await writeFile(join(options.directory, '.env'), 'TOKEN=example\n');
      if (tracked) { git(options.directory, 'add', '.env'); git(options.directory, 'commit', '-m', 'sensitive base'); options.baseSha = await pinCandidateBase(options.directory); await rm(join(options.directory, '.env')); }
      const result = await captureLocalCandidate(options); assert.equal(result.status, 'unavailable'); assert.equal(result.reason, 'secret_path');
      assert.deepEqual(await readdir(join(options.dataDir, 'candidates')), []);
    } finally { await rm(options.root, { recursive: true, force: true }); }
  }
});

test('candidate capture refuses private key content and oversized files without partial downloads', async () => {
  const options = await fixture();
  try {
    await writeFile(join(options.directory, 'source.txt'), ['-----BEGIN ', 'PRIVATE KEY-----'].join(''));
    assert.equal((await captureLocalCandidate(options)).reason, 'secret_content');
    await writeFile(join(options.directory, 'source.txt'), Buffer.alloc(17 * 1024 * 1024));
    assert.equal((await captureLocalCandidate(options)).reason, 'size_limit');
    await assert.rejects(readCandidate(options.dataDir, options.sessionId, 'bundle'), { code: 'ENOENT' });
  } finally { await rm(options.root, { recursive: true, force: true }); }
});

test('candidate capture rejects Git indirection and download traversal or corrupted bytes', async () => {
  const options = await fixture();
  try {
    await mkdir(join(options.directory, '.git/objects/info'), { recursive: true });
    await writeFile(join(options.directory, '.git/objects/info/alternates'), '/outside/objects\n');
    assert.equal((await captureLocalCandidate(options)).reason, 'unsupported_repository');
    await rm(join(options.directory, '.git/objects/info/alternates'));
    assert.equal((await captureLocalCandidate(options)).status, 'ready');
    await assert.rejects(readCandidate(options.dataDir, '../session-one', 'bundle'));
    await writeFile(join(options.dataDir, 'candidates', options.sessionId, 'candidate.git.bundle'), 'tampered');
    await assert.rejects(readCandidate(options.dataDir, options.sessionId, 'bundle'), /integrity/);
  } finally { await rm(options.root, { recursive: true, force: true }); }
});

test('candidate capture includes staged ignored files and committed changes against the pinned base', async () => {
  const options = await fixture();
  try {
    await writeFile(join(options.directory, 'ignored.log'), 'tracked intentionally\n');
    git(options.directory, 'add', '-f', 'ignored.log'); git(options.directory, 'commit', '-m', 'writer commit');
    await writeFile(join(options.directory, '.gitignore'), 'ignored.log\nstaged.bin\n');
    await writeFile(join(options.directory, 'staged.bin'), Buffer.from([0, 128])); git(options.directory, 'add', '-f', 'staged.bin');
    const candidate = await captureLocalCandidate(options); assert.equal(candidate.status, 'ready', candidate.reason);
    const manifest = JSON.parse((await readCandidate(options.dataDir, options.sessionId, 'manifest')).content.toString()) as CandidateManifest;
    assert(manifest.files.some(file => file.path === 'ignored.log')); assert(manifest.files.some(file => file.path === 'staged.bin'));
    assert.equal(manifest.baseSha, options.baseSha);
  } finally { await rm(options.root, { recursive: true, force: true }); }
});


test('candidate preserves a tracked deletion even when the ignored local file remains', async () => {
  const options = await fixture();
  try {
    git(options.directory, 'rm', '--cached', 'remove.txt');
    await writeFile(join(options.directory, '.gitignore'), 'ignored.log\nremove.txt\n');
    git(options.directory, 'add', '.gitignore'); git(options.directory, 'commit', '-m', 'stop tracking local file');
    const result = await captureLocalCandidate(options); assert.equal(result.status, 'ready', result.reason);
    const manifest = JSON.parse((await readCandidate(options.dataDir, options.sessionId, 'manifest')).content.toString()) as CandidateManifest;
    assert.equal(manifest.files.find(file => file.path === 'remove.txt')?.status, 'deleted');
  } finally { await rm(options.root, { recursive: true, force: true }); }
});

test('Git LFS pointers are refused rather than presented as complete binary content', async () => {
  const options = await fixture();
  try {
    await writeFile(join(options.directory, 'large.bin'), 'version https://git-lfs.github.com/spec/v1\noid sha256:' + 'a'.repeat(64) + '\nsize 999999\n');
    assert.equal((await captureLocalCandidate(options)).reason, 'unsupported_repository');
  } finally { await rm(options.root, { recursive: true, force: true }); }
});

test('Kubernetes export fences the writer and persists authenticated full candidate downloads', async () => {
  const { createServer } = await import('node:http');
  const { KubernetesWorkspaces } = await import('../src/runtime/kubernetes.ts');
  const options = await fixture();
  const repository = { id: options.repositoryId, name: 'Fixture', description: '', url: 'https://forge.invalid/fixture.git', baseBranch: 'main', verify: [] };
  const calls: { path: string; method: string; body?: any }[] = [];
  const config = candidateConfiguration(join(options.root, 'controller'));
  let exporter: any;
  const server = createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Basic ' + Buffer.from('opencode:export-only').toString('base64'));
    if (req.url === '/health') { res.end(JSON.stringify({ status: 'ready' })); return; }
    const format = ({ '/manifest': 'manifest', '/bundle': 'bundle', '/patch': 'patch' } as const)[req.url as '/manifest'];
    const file = await readCandidate(options.dataDir, options.sessionId, format); res.end(file.content);
  });
  try {
    await writeFile(join(options.directory, 'source.txt'), 'remote result\n');
    assert.equal((await captureLocalCandidate(options)).status, 'ready');
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
    const address = server.address() as { port: number };
    const session = candidateSession(options.sessionId, { id: options.sessionId, backend: 'kubernetes', directory: '/workspace/repository', endpoint: `http://127.0.0.1:${address.port}`, metadata: { baseSha: options.baseSha } });
    const client = { async request(path: string, method = 'GET', body?: any) {
      calls.push({ path, method, body });
      if (method === 'DELETE') return {};
      if (method === 'POST') { exporter = body; return body; }
      return exporter ? { status: { phase: 'Running' } } : undefined;
    } };
    const manager = new KubernetesWorkspaces(config, client as any); manager.passwords.set(session.id, { username: 'opencode', password: 'export-only' });
    const candidate = await manager.captureCandidate(session, repository); assert.equal(candidate.status, 'ready', candidate.reason);
    assert.equal(calls[0].method, 'DELETE'); assert.equal(calls[1].method, 'GET'); assert.equal(calls[2].method, 'POST');
    assert.equal(exporter.spec.automountServiceAccountToken, false);
    assert.equal(exporter.spec.volumes.find((v: any) => v.name === 'workspace').persistentVolumeClaim.readOnly, true);
    assert.equal(exporter.spec.containers[0].volumeMounts.find((v: any) => v.name === 'workspace').readOnly, true);
    assert.equal(exporter.spec.containers[0].env.some((env: any) => /LITELLM|GIT_|KUBERNETES|MASTER/.test(env.name)), false);
    assert.match((await readCandidate(config.dataDir, session.id, 'patch')).content.toString(), /remote result/);
  } finally { await new Promise<void>(done => server.close(() => done())); await rm(options.root, { recursive: true, force: true }); }
});

test('Kubernetes export refuses unconfirmed writer termination before creating an exporter', async () => {
  const { KubernetesWorkspaces } = await import('../src/runtime/kubernetes.ts');
  const calls: string[] = [];
  const config = candidateConfiguration('/unused');
  const client = { async request(_path: string, method = 'GET') { calls.push(method); throw new Error('termination unconfirmed'); } };
  const manager = new KubernetesWorkspaces(config, client as any);
  const session = candidateSession('blocked-export', { id: 'blocked-export', backend: 'kubernetes', directory: '/workspace/repository', endpoint: 'http://unused.invalid', metadata: { baseSha: 'a'.repeat(40) } });
  manager.passwords.set(session.id, { username: 'opencode', password: 'unused' });
  assert.equal((await manager.captureCandidate(session, registeredRepository)).reason, 'stop_unconfirmed');
  assert.deepEqual(calls, ['DELETE']);
});

test('the exact trusted Kubernetes helper executes without TypeScript or repository runtime dependencies', async () => {
  const { spawn } = await import('node:child_process');
  const { createServer } = await import('node:http');
  const { candidateExportManifest } = await import('../src/runtime/kubernetes.ts');
  const options = await fixture(); let child: ReturnType<typeof spawn> | undefined;
  const reserve = createServer();
  try {
    await writeFile(join(options.directory, 'source.txt'), 'helper result\n');
    await new Promise<void>(done => reserve.listen(0, '127.0.0.1', done)); const port = (reserve.address() as { port: number }).port;
    await new Promise<void>(done => reserve.close(() => done()));
    const session = candidateSession(options.sessionId, { id: options.sessionId, backend: 'kubernetes', directory: '/workspace/repository', metadata: { baseSha: options.baseSha } });
    const config = candidateConfiguration('/unused');
    const pod = candidateExportManifest(config, session, registeredRepository);
    const argv = pod.spec.containers[0].command.slice(1) as string[];
    argv[2] = argv[2].replaceAll("'/workspace/repository'", JSON.stringify(options.directory)).replaceAll("'/exports'", JSON.stringify(join(options.root, 'helper'))).replace("listen(4096,'0.0.0.0')", `listen(${port},'127.0.0.1')`);
    child = spawn(process.execPath, argv, { env: { PATH: process.env.PATH, CANDIDATE_SESSION: options.sessionId, CANDIDATE_REPOSITORY: options.repositoryId, CANDIDATE_BASE: options.baseSha, OPENCODE_SERVER_USERNAME: 'export', OPENCODE_SERVER_PASSWORD: 'helper-test' }, stdio: ['ignore', 'ignore', 'pipe'] });
    let failure = ''; child.stderr!.on('data', chunk => { failure += chunk.toString(); });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      assert.equal(child.exitCode, null, failure);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`, { headers: { authorization: 'Basic ' + Buffer.from('export:helper-test').toString('base64') } });
        const result = await response.json(); assert.equal(result.status, 'ready', result.reason); ready = true; break;
      } catch { await new Promise(done => setTimeout(done, 50)); }
    }
    assert.equal(ready, true, failure);
    assert.equal((await fetch(`http://127.0.0.1:${port}/bundle`)).status, 401);
    const response = await fetch(`http://127.0.0.1:${port}/patch`, { headers: { authorization: 'Basic ' + Buffer.from('export:helper-test').toString('base64') } });
    assert.match(await response.text(), /helper result/);
  } finally {
    if (child && child.exitCode === null) { child.kill('SIGTERM'); await new Promise(done => child!.once('close', done)); }
    await rm(options.root, { recursive: true, force: true });
  }
});

test('a shallow source produces a self-contained candidate bundle without missing parent history', async () => {
  const options = await fixture();
  try {
    await writeFile(join(options.directory, 'source.txt'), 'second base\n'); git(options.directory, 'add', '.'); git(options.directory, 'commit', '-m', 'second base');
    const shallow = join(options.root, 'shallow'); git(options.root, 'clone', '--depth=1', new URL('file://' + options.directory).href, shallow);
    assert.equal(git(shallow, 'rev-parse', '--is-shallow-repository'), 'true');
    const baseSha = await pinCandidateBase(shallow); await writeFile(join(shallow, 'source.txt'), 'shallow change\n');
    const candidate = await captureLocalCandidate({ ...options, directory: shallow, baseSha }); assert.equal(candidate.status, 'ready', candidate.reason);
    const bundle = join(options.root, 'shallow.bundle'); await writeFile(bundle, (await readCandidate(options.dataDir, options.sessionId, 'bundle')).content);
    await rm(shallow, { recursive: true }); await rm(options.directory, { recursive: true });
    const clone = join(options.root, 'offline'); git(options.root, 'clone', '--branch', 'vloer-candidate', bundle, clone);
    assert.equal(await readFile(join(clone, 'source.txt'), 'utf8'), 'shallow change\n'); assert.equal(git(clone, 'rev-list', '--count', 'HEAD'), '2');
  } finally { await rm(options.root, { recursive: true, force: true }); }
});

test('object database symlinks cannot read files outside the source repository', async () => {
  const options = await fixture();
  try {
    await symlink(options.root, join(options.directory, '.git/objects/ab'));
    assert.equal((await captureLocalCandidate(options)).reason, 'unsupported_repository');
  } finally { await rm(options.root, { recursive: true, force: true }); }
});

test('source-local Git excludes remain excluded without reading executable local configuration', async () => {
  const options = await fixture();
  try {
    await writeFile(join(options.directory, '.git/info/exclude'), 'local-token.txt\n');
    await writeFile(join(options.directory, 'local-token.txt'), 'opaque private credential without a recognizable prefix\n');
    await writeFile(join(options.directory, 'source.txt'), 'public change\n');
    const candidate = await captureLocalCandidate(options); assert.equal(candidate.status, 'ready', candidate.reason);
    const manifest = JSON.parse((await readCandidate(options.dataDir, options.sessionId, 'manifest')).content.toString()) as CandidateManifest;
    assert.equal(manifest.files.some(file => file.path === 'local-token.txt'), false);
    assert.equal((await readCandidate(options.dataDir, options.sessionId, 'patch')).content.includes('opaque private'), false);
  } finally { await rm(options.root, { recursive: true, force: true }); }
});

test('remote capture never returns ready from corrupt or mismatched persisted evidence', async () => {
  const options = await fixture();
  try {
    await writeFile(join(options.directory, 'source.txt'), 'candidate content\n');
    assert.equal((await captureLocalCandidate(options)).status, 'ready');
    const manifest = JSON.parse((await readCandidate(options.dataDir, options.sessionId, 'manifest')).content.toString()) as CandidateManifest;
    const bundle = (await readCandidate(options.dataDir, options.sessionId, 'bundle')).content;
    const patch = (await readCandidate(options.dataDir, options.sessionId, 'patch')).content;
    const remote = join(options.root, 'remote');
    assert.equal((await persistRemoteCandidate(remote, options.sessionId, manifest, bundle, patch)).status, 'ready');
    assert.equal((await persistRemoteCandidate(remote, options.sessionId, { ...manifest, repositoryId: 'wrong-repository' }, bundle, patch)).status, 'unavailable');
    await rm(join(remote, 'candidates', options.sessionId, 'candidate.git.bundle'));
    assert.equal((await persistRemoteCandidate(remote, options.sessionId, manifest, bundle, patch)).status, 'unavailable');
    await writeFile(join(remote, 'candidates', options.sessionId, 'candidate.git.bundle'), Buffer.from('corrupt'));
    assert.equal((await persistRemoteCandidate(remote, options.sessionId, manifest, bundle, patch)).status, 'unavailable');
  } finally { await rm(options.root, { recursive: true, force: true }); }
});
