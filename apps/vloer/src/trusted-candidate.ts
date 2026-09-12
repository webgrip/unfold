import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile, rename, rm, open, realpath } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { readCandidate, type CandidateManifest } from './candidates.ts';
import { digest, deliveryPath, policyDigest, type DeliveryPolicy } from './delivery-config.ts';

export type CanonicalCandidate = { sessionId: string; repositoryId: string; baseSha: string; canonicalSha: string; treeSha: string; artifactSha: string; policySha: string; directory: string; gitDirectory: string; bundlePath: string };
export const deliveryFailure = (code: string): never => { throw Object.assign(new Error(`Candidate delivery blocked: ${code.replaceAll('_', ' ')}.`), { status: 409, code }); };
const sha = (value: string): string => /^[a-f0-9]{40}$/.test(value) ? value : deliveryFailure('invalid_git_identity');

export async function deliveryGit(directory: string, args: string[], input?: Buffer): Promise<Buffer> {
  return new Promise((done, fail) => {
    const child = spawn('git', ['--no-pager', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'core.attributesFile=/dev/null', '-c', 'core.autocrlf=false', '-c', 'commit.gpgSign=false', '-c', 'protocol.allow=never', ...args], { cwd: directory, env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: directory, LANG: 'C.UTF-8', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_DIR: directory, GIT_AUTHOR_NAME: 'De Vloer delivery', GIT_AUTHOR_EMAIL: 'delivery@localhost', GIT_COMMITTER_NAME: 'De Vloer delivery', GIT_COMMITTER_EMAIL: 'delivery@localhost', GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z' }, signal: AbortSignal.timeout(60000), stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks: Buffer[] = []; let size = 0;
    child.stdout.on('data', chunk => { size += chunk.length; if (size > 128 * 1024 * 1024) child.kill('SIGKILL'); else chunks.push(chunk); });
    child.stderr.on('data', () => {}); child.stdin.on('error', () => {}); child.once('error', () => fail(Object.assign(new Error('Candidate Git validation failed.'), { status: 409, code: 'git_validation' })));
    child.once('close', code => code === 0 && size <= 128 * 1024 * 1024 ? done(Buffer.concat(chunks)) : fail(Object.assign(new Error('Candidate Git validation failed.'), { status: 409, code: 'git_validation' })));
    child.stdin.end(input);
  });
}

export async function deliveryRead(path: string, maximum = 128 * 1024 * 1024): Promise<Buffer> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { const before = await handle.stat(); if (!before.isFile() || before.size > maximum) deliveryFailure('invalid_artifact'); const content = await handle.readFile(); const after = await handle.stat(); if (content.length !== before.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) deliveryFailure('artifact_changed'); return content; } finally { await handle.close(); }
}

async function tree(directory: string, revision: string): Promise<Map<string, { mode: string; blob: string; bytes: number }>> {
  const result = new Map<string, { mode: string; blob: string; bytes: number }>(); let total = 0;
  for (const line of (await deliveryGit(directory, ['ls-tree', '-r', '-l', '-z', revision])).toString('utf8').split('\0').filter(Boolean)) {
    const match = /^(100644|100755) blob ([a-f0-9]{40}) +([0-9]+)\t([\s\S]+)$/.exec(line);
    if (!match || !deliveryPath(match[4])) deliveryFailure('unsupported_tree');
    const bytes = Number(match![3]); total += bytes;
    if (bytes > 16 * 1024 * 1024 || total > 64 * 1024 * 1024 || result.size >= 5000) deliveryFailure('candidate_too_large');
    result.set(match![4], { mode: match![1], blob: match![2], bytes });
  }
  return result;
}

export async function canonicalizeCandidate(dataDir: string, sessionId: string, policy: DeliveryPolicy): Promise<CanonicalCandidate> {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(sessionId)) deliveryFailure('invalid_session');
  const artifact = await readCandidate(dataDir, sessionId, 'manifest'); const manifest = JSON.parse(artifact.content.toString('utf8')) as CandidateManifest;
  if (manifest.version !== 1 || manifest.sessionId !== sessionId || manifest.repositoryId !== policy.repositoryId || manifest.baseSha !== policy.approvedBaseSha || manifest.history !== 'synthetic_snapshot_commits' || manifest.verification !== 'not_performed' || manifest.publication !== 'not_performed') deliveryFailure('unapproved_base_or_manifest');
  for (const id of [manifest.baseSha, manifest.snapshotBaseSha, manifest.headSha, manifest.treeSha]) sha(id);
  const policySha = policyDigest(policy); const artifactSha = digest(artifact.content);
  const root = resolve(dataDir, 'delivery'); await mkdir(root, { recursive: true, mode: 0o700 });
  const destination = join(root, `${sessionId}-${policySha}`);
  let temporary: string | undefined = await mkdtemp(join(root, '.canonical-'));
  try {
    const gitDirectory = join(temporary, 'git'); await mkdir(gitDirectory);
    await deliveryGit(gitDirectory, ['init', '--bare', '--object-format=sha1']);
    const approvedBundle = join(temporary, 'approved.bundle'); await writeFile(approvedBundle, await deliveryRead(policy.approvedBaseBundle), { mode: 0o600 });
    await deliveryGit(gitDirectory, ['bundle', 'unbundle', approvedBundle]);
    const baseTree = (await deliveryGit(gitDirectory, ['rev-parse', `${policy.approvedBaseSha}^{tree}`])).toString().trim();
    const rawBundle = await readCandidate(dataDir, sessionId, 'bundle'); const rawPatch = await readCandidate(dataDir, sessionId, 'patch');
    const bundle = join(temporary, 'source.bundle'); await writeFile(bundle, rawBundle.content, { mode: 0o600 });
    await deliveryGit(gitDirectory, ['bundle', 'unbundle', bundle]);
    await deliveryGit(gitDirectory, ['fsck', '--full', '--no-reflogs']);
    if ((await deliveryGit(gitDirectory, ['rev-parse', `${manifest.snapshotBaseSha}^{tree}`])).toString().trim() !== baseTree || (await deliveryGit(gitDirectory, ['rev-parse', `${manifest.headSha}^{tree}`])).toString().trim() !== manifest.treeSha || (await deliveryGit(gitDirectory, ['rev-list', '--parents', '-n', '1', manifest.headSha])).toString().trim() !== `${manifest.headSha} ${manifest.snapshotBaseSha}`) deliveryFailure('tree_identity_mismatch');
    const patch = await deliveryGit(gitDirectory, ['diff', '--binary', '--full-index', '--no-ext-diff', '--no-textconv', '--no-renames', manifest.snapshotBaseSha, manifest.headSha, '--']);
    if (!patch.equals(rawPatch.content)) deliveryFailure('patch_identity_mismatch');
    const base = await tree(gitDirectory, policy.approvedBaseSha); const current = await tree(gitDirectory, manifest.headSha);
    const changed = [...new Set([...base.keys(), ...current.keys()])].sort().filter(path => base.get(path)?.blob !== current.get(path)?.blob || base.get(path)?.mode !== current.get(path)?.mode);
    const expectedFiles = changed.map(path => { const before = base.get(path); const after = current.get(path); return { path, status: !before ? 'added' : !after ? 'deleted' : 'modified', ...(before ? { baseMode: before.mode, baseBlob: before.blob } : {}), ...(after ? { mode: after.mode, blob: after.blob } : {}), bytes: after?.bytes ?? 0 }; });
    if (!Array.isArray(manifest.files) || manifest.fileCount !== changed.length || JSON.stringify([...manifest.files].sort((a, b) => a.path.localeCompare(b.path))) !== JSON.stringify(expectedFiles.sort((a, b) => a.path.localeCompare(b.path)))) deliveryFailure('manifest_files_mismatch');
    if (changed.some(path => policy.protectedPaths.some(protectedPath => path === protectedPath || path.startsWith(protectedPath + '/')))) deliveryFailure('protected_input_changed');
    const canonicalSha = sha((await deliveryGit(gitDirectory, ['commit-tree', manifest.treeSha, '-p', policy.approvedBaseSha, '-m', `Verified delivery candidate ${sessionId}\n\nArtifact: ${artifactSha}\nPolicy: ${policySha}`])).toString().trim());
    await deliveryGit(gitDirectory, ['update-ref', 'refs/heads/candidate', canonicalSha]);
    const bundlePath = join(temporary, 'canonical.bundle'); await deliveryGit(gitDirectory, ['bundle', 'create', bundlePath, 'refs/heads/candidate']);
    const directory = join(temporary, 'tree'); await mkdir(directory, { mode: 0o755 });
    for (const [path, entry] of current) { const destinationPath = join(directory, path); await mkdir(dirname(destinationPath), { recursive: true, mode: 0o755 }); await writeFile(destinationPath, await deliveryGit(gitDirectory, ['cat-file', 'blob', entry.blob]), { mode: entry.mode === '100755' ? 0o555 : 0o444 }); }
    const trustedPolicy = join(temporary, 'policy'); await mkdir(trustedPolicy, { mode: 0o755 });
    const policyRoot = await realpath(policy.directory);
    const actualDataRoot = await realpath(dataDir);
    const actualBaseBundle = await realpath(policy.approvedBaseBundle);
    if ([policyRoot, actualBaseBundle].some(path => path === actualDataRoot || path.startsWith(actualDataRoot + '/'))) deliveryFailure('policy_inside_workspace_storage');
    for (const [path, expected] of Object.entries(policy.files)) { const source = join(policyRoot, path); if (!deliveryPath(path) || await realpath(source) !== source) deliveryFailure('invalid_policy_file'); const content = await deliveryRead(source, 1024 * 1024); if (digest(content) !== expected) deliveryFailure('policy_changed'); const target = join(trustedPolicy, path); await mkdir(dirname(target), { recursive: true, mode: 0o755 }); await writeFile(target, content, { mode: 0o444 }); }
    const result: CanonicalCandidate = { sessionId, repositoryId: policy.repositoryId, baseSha: policy.approvedBaseSha, canonicalSha, treeSha: manifest.treeSha, artifactSha, policySha, directory: join(destination, 'tree'), gitDirectory: join(destination, 'git'), bundlePath: join(destination, 'canonical.bundle') };
    await writeFile(join(temporary, 'canonical.json'), JSON.stringify(result), { mode: 0o600 });
    try { await rename(temporary, destination); temporary = undefined; }
    catch (error) { if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; const previous = JSON.parse((await deliveryRead(join(destination, 'canonical.json'))).toString()); if (JSON.stringify(previous) !== JSON.stringify(result)) deliveryFailure('candidate_changed'); }
    return result;
  } finally { if (temporary) await rm(temporary, { recursive: true, force: true }); }
}
