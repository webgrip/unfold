import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile, rename, rm, lstat, realpath, open, readlink, access, readdir } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

export type CandidateFormat = 'bundle' | 'patch' | 'manifest';
export type CandidateFile = { path: string; status: 'added' | 'modified' | 'deleted'; baseMode?: string; mode?: string; baseBlob?: string; blob?: string; bytes: number };
export type Candidate = {
  status: 'ready' | 'unavailable'; reason?: string; message?: string; createdAt?: string; baseSha?: string;
  snapshotBaseSha?: string; headSha?: string; treeSha?: string; fileCount?: number; bytes?: number;
  sha256?: { bundle: string; patch: string }; formats?: CandidateFormat[];
};
export type CandidateManifest = {
  version: 1; sessionId: string; repositoryId: string; createdAt: string; baseSha: string;
  snapshotBaseSha: string; headSha: string; treeSha: string;
  history: 'synthetic_snapshot_commits'; verification: 'not_performed'; publication: 'not_performed';
  scope: 'base_and_index_tracked_plus_unignored_worktree';
  files: CandidateFile[]; fileCount: number; bytes: number;
  downloads: { bundle: { filename: string; bytes: number; sha256: string }; patch: { filename: string; bytes: number; sha256: string } };
};
export type CaptureOptions = { dataDir: string; sessionId: string; repositoryId: string; directory: string; baseSha: string; timeoutMs?: number };
type TreeEntry = { mode: string; blob: string; bytes: number };

const limits = { files: 5000, fileBytes: 16 * 1024 * 1024, sourceBytes: 64 * 1024 * 1024, outputBytes: 128 * 1024 * 1024 };
const names: Record<CandidateFormat, string> = { bundle: 'candidate.git.bundle', patch: 'candidate.patch', manifest: 'manifest.json' };
const unavailableMessages: Record<string, string> = { capture_failed: 'The candidate could not be captured. The workspace is retained for manual review.', base_unavailable: 'The original Git base could not be established. Review the retained workspace manually.', unsupported_workspace: 'This workspace does not support complete candidate export. Use a provisioned local or Kubernetes workspace.', unsupported_repository: 'This repository uses a Git layout or file type this exporter does not support. Review the retained workspace manually.', secret_path: 'A sensitive file path blocks this export. Remove credentials from the change before creating a new session.', secret_content: 'A recognizable secret blocks this export. Remove the secret before creating a new session.', size_limit: 'The workspace exceeds the bounded export limits. Review the retained workspace or reduce the change.', workspace_changed: 'The workspace changed during capture. No partial candidate was published; review the retained workspace.', stop_unconfirmed: 'The previous runtime has not confirmed it stopped. Export remains blocked to avoid an inconsistent snapshot.', not_ready: 'A candidate is available after the session finishes preparing its review.' };

export function unavailableCandidate(reason = 'capture_failed'): Candidate { const code = Object.hasOwn(unavailableMessages, reason) ? reason : 'capture_failed'; return { status: 'unavailable', reason: code, message: unavailableMessages[code] }; }

class CaptureError extends Error { readonly reason: string; constructor(reason: string) { super(reason); this.reason = reason; } }
function reject(reason: string): never { throw new CaptureError(reason); }
const sha256 = (value: Buffer): string => createHash('sha256').update(value).digest('hex');
const identity = (value: string): string => /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : reject('capture_failed');
const revision = (value: string): string => /^[a-f0-9]{40}$/.test(value) ? value : reject('base_unavailable');
const decode = (value: Buffer): string => new TextDecoder('utf-8', { fatal: true }).decode(value);

function safePath(path: string): string {
  if (!path || path.length > 4096 || path.includes('\0') || path.includes('\\') || isAbsolute(path) || path.split('/').some(part => !part || part === '.' || part === '..' || part.toLowerCase() === '.git')) reject('unsupported_repository');
  const components = path.toLowerCase().split('/');
  const leaf = components.at(-1)!;
  if (components.some(part => ['.ssh', '.aws', '.kube', '.gnupg'].includes(part)) || /^(\.env(?:\..+)?|\.envrc|\.npmrc|\.pypirc|\.netrc|\.git-credentials|auth\.json|credentials(?:\..+)?|service[-_]account(?:\..+)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?)$/.test(leaf) && !/^\.env\.(?:example|sample|template)$/.test(leaf) || /\.(?:pem|key|p12|pfx)$/.test(leaf) || path.toLowerCase().endsWith('.docker/config.json')) reject('secret_path');
  return path;
}

function inspectContent(content: Buffer): void {
  const value = content.toString('utf8');
  if (value.startsWith('version https://git-lfs.github.com/spec/v1\n')) reject('unsupported_repository');
  if (/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|\bAKIA[A-Z0-9]{16}\b|\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|glpat-[A-Za-z0-9_-]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{40,})\b/.test(value)) reject('secret_content');
}

async function boundedRead(path: string, maximum = limits.fileBytes): Promise<Buffer> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile()) reject('unsupported_repository');
    if (before.size > maximum) reject('size_limit');
    const content = await handle.readFile();
    const after = await handle.stat();
    if (content.length > maximum) reject('size_limit');
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || content.length !== before.size) reject('workspace_changed');
    return content;
  } finally { await handle.close(); }
}

async function git(args: string[], gitDirectory: string, workspace: string, signal: AbortSignal, input?: Buffer, index?: string): Promise<Buffer> {
  signal.throwIfAborted();
  return await new Promise<Buffer>((done, fail) => {
    const child = spawn('git', ['--no-pager', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'core.attributesFile=/dev/null', '-c', 'core.autocrlf=false', '-c', 'core.quotePath=true', '-c', 'commit.gpgSign=false', '-c', 'protocol.allow=never', ...args], {
      cwd: workspace, signal, env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: gitDirectory, LANG: 'C.UTF-8', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_DIR: gitDirectory, ...(args[0] === 'init' ? {} : { GIT_WORK_TREE: workspace }), GIT_INDEX_FILE: index ?? join(gitDirectory, 'index'), GIT_OPTIONAL_LOCKS: '0', GIT_AUTHOR_NAME: 'De Vloer snapshot', GIT_AUTHOR_EMAIL: 'snapshot@localhost', GIT_COMMITTER_NAME: 'De Vloer snapshot', GIT_COMMITTER_EMAIL: 'snapshot@localhost' }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = []; let size = 0; let tooLarge = false;
    child.stdout.on('data', (chunk: Buffer) => { size += chunk.length; if (size > limits.outputBytes) { tooLarge = true; child.kill('SIGKILL'); } else chunks.push(chunk); });
    child.stderr.on('data', () => {});
    child.stdin.on('error', () => {});
    child.once('error', fail);
    child.once('close', code => code === 0 && !tooLarge ? done(Buffer.concat(chunks)) : fail(new CaptureError(tooLarge ? 'size_limit' : 'capture_failed')));
    child.stdin.end(input);
  });
}

async function sourceGitDirectory(directory: string): Promise<string> {
  const source = await realpath(directory);
  const metadata = join(source, '.git');
  const item = await lstat(metadata);
  if (!item.isDirectory() || item.isSymbolicLink()) reject('unsupported_repository');
  const objects = join(metadata, 'objects');
  if (!(await lstat(objects)).isDirectory() || (await realpath(objects)) !== objects) reject('unsupported_repository');
  const directories = [objects]; let entries = 0;
  while (directories.length) {
    for (const entry of await readdir(directories.pop()!, { withFileTypes: true })) {
      if (++entries > 100000) reject('size_limit');
      if (entry.isSymbolicLink() || !entry.isDirectory() && !entry.isFile()) reject('unsupported_repository');
      if (entry.isDirectory()) directories.push(join(entry.parentPath, entry.name));
    }
  }
  try { await access(join(objects, 'info', 'alternates')); reject('unsupported_repository'); } catch (error) { if (error instanceof CaptureError || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  return metadata;
}

async function sourceExcludes(metadata: string): Promise<Buffer> {
  const path = join(metadata, 'info', 'exclude');
  try {
    if (await realpath(dirname(path)) !== dirname(path)) reject('unsupported_repository');
    return await boundedRead(path, 1024 * 1024);
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return Buffer.alloc(0); throw error; }
}

export async function pinCandidateBase(directory: string): Promise<string> {
  const metadata = await sourceGitDirectory(directory);
  const head = decode(await boundedRead(join(metadata, 'HEAD'), 4096)).trim();
  if (/^[a-f0-9]{40}$/.test(head)) return head;
  const match = /^ref: (refs\/heads\/[A-Za-z0-9_./-]+)$/.exec(head);
  if (!match || match[1].split('/').some(part => !part || part === '.' || part === '..')) reject('base_unavailable');
  const path = join(metadata, match[1]);
  try {
    if (await realpath(dirname(path)) !== dirname(path)) reject('unsupported_repository');
    return revision(decode(await boundedRead(path, 256)).trim());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const packed = decode(await boundedRead(join(metadata, 'packed-refs'), 2 * 1024 * 1024));
    const line = packed.split('\n').find(line => line.endsWith(` ${match[1]}`));
    return revision(line?.slice(0, 40) ?? '');
  }
}

async function treeEntries(gitDirectory: string, directory: string, sha: string, signal: AbortSignal): Promise<Map<string, TreeEntry>> {
  const output = decode(await git(['ls-tree', '-r', '-l', '-z', '--full-tree', sha], gitDirectory, directory, signal));
  const entries = new Map<string, TreeEntry>(); let total = 0;
  for (const record of output.split('\0').filter(Boolean)) {
    const match = /^(\d{6}) (\w+) ([a-f0-9]{40}) +([0-9-]+)\t([\s\S]+)$/.exec(record);
    if (!match || match[2] !== 'blob' || !['100644', '100755', '120000'].includes(match[1])) reject('unsupported_repository');
    const path = safePath(match[5]); const bytes = Number(match[4]);
    if (!Number.isSafeInteger(bytes) || bytes > limits.fileBytes || bytes < 0) reject('size_limit');
    total += bytes;
    if (total > limits.sourceBytes || entries.size >= limits.files) reject('size_limit');
    entries.set(path, { mode: match[1], blob: match[3], bytes });
  }
  return entries;
}

async function readWorktreeFile(directory: string, path: string): Promise<{ mode: string; content: Buffer } | undefined> {
  const filename = join(directory, safePath(path));
  try {
    const parent = await realpath(dirname(filename));
    if (parent !== dirname(filename) || relative(directory, parent).split('/').includes('..')) reject('unsupported_repository');
    const item = await lstat(filename);
    if (item.isSymbolicLink()) return { mode: '120000', content: Buffer.from(await readlink(filename)) };
    if (!item.isFile()) reject('unsupported_repository');
    return { mode: item.mode & 0o111 ? '100755' : '100644', content: await boundedRead(filename) };
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}

async function writeBlob(gitDirectory: string, content: Buffer): Promise<string> {
  const object = Buffer.concat([Buffer.from(`blob ${content.length}\0`), content]);
  const blob = createHash('sha1').update(object).digest('hex');
  await mkdir(join(gitDirectory, 'objects', blob.slice(0, 2)), { recursive: true });
  await writeFile(join(gitDirectory, 'objects', blob.slice(0, 2), blob.slice(2)), deflateSync(object), { mode: 0o600 });
  return blob;
}

function metadata(manifest: CandidateManifest): Candidate {
  return { status: 'ready', createdAt: manifest.createdAt, baseSha: manifest.baseSha, snapshotBaseSha: manifest.snapshotBaseSha, headSha: manifest.headSha, treeSha: manifest.treeSha, fileCount: manifest.fileCount, bytes: manifest.bytes, sha256: { bundle: manifest.downloads.bundle.sha256, patch: manifest.downloads.patch.sha256 }, formats: ['bundle', 'patch', 'manifest'] };
}

export async function captureLocalCandidate(options: CaptureOptions): Promise<Candidate> {
  let temporary: string | undefined;
  try {
    const sessionId = identity(options.sessionId); const baseSha = revision(options.baseSha);
    const root = resolve(options.dataDir, 'candidates'); const destination = join(root, sessionId);
    await mkdir(root, { recursive: true, mode: 0o700 });
    try { const existing = JSON.parse(decode(await boundedRead(join(destination, names.manifest), limits.fileBytes))) as CandidateManifest; if (existing.sessionId !== sessionId || existing.repositoryId !== options.repositoryId || existing.baseSha !== baseSha) reject('capture_failed'); await readCandidate(options.dataDir, sessionId, 'bundle'); await readCandidate(options.dataDir, sessionId, 'patch'); return metadata(existing); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const directory = await realpath(options.directory);
    const sourceGit = await sourceGitDirectory(directory);
    const sourceIndex = join(sourceGit, 'index');
    const indexBefore = await boundedRead(sourceIndex, limits.fileBytes);
    const excludesBefore = await sourceExcludes(sourceGit);
    const headBefore = await pinCandidateBase(directory);
    temporary = await mkdtemp(join(root, `.capture-${sessionId}-`));
    const gitDirectory = join(temporary, 'git');
    const signal = AbortSignal.timeout(Math.max(100, Math.min(options.timeoutMs ?? 60_000, 120_000)));
    await mkdir(gitDirectory, { mode: 0o700 });
    await git(['init', '--bare', '--object-format=sha1'], gitDirectory, directory, signal);
    await mkdir(join(gitDirectory, 'objects', 'info'), { recursive: true });
    await mkdir(join(gitDirectory, 'info'), { recursive: true });
    await writeFile(join(gitDirectory, 'info', 'exclude'), excludesBefore);
    await writeFile(join(gitDirectory, 'objects', 'info', 'alternates'), join(sourceGit, 'objects') + '\n');
    const base = await treeEntries(gitDirectory, directory, baseSha, signal);
    for (const entry of base.values()) inspectContent(await git(['cat-file', 'blob', entry.blob], gitDirectory, directory, signal));
    const pathsOutput = await git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'], gitDirectory, directory, signal, undefined, sourceIndex);
    const selectedPaths = new Set(decode(pathsOutput).split('\0').filter(Boolean));
    const paths = [...new Set([...base.keys(), ...selectedPaths])].sort();
    if (paths.length > limits.files) reject('size_limit');
    const current = new Map<string, TreeEntry>(); let sourceBytes = 0;
    for (const path of paths) {
      signal.throwIfAborted(); safePath(path);
      if (!selectedPaths.has(path)) continue;
      const entry = await readWorktreeFile(directory, path); if (!entry) continue;
      sourceBytes += entry.content.length; if (sourceBytes > limits.sourceBytes) reject('size_limit');
      inspectContent(entry.content);
      current.set(path, { mode: entry.mode, blob: await writeBlob(gitDirectory, entry.content), bytes: entry.content.length });
    }
    const records = [...current].map(([path, entry]) => `${entry.mode} ${entry.blob}\t${path}\0`).join('');
    await git(['read-tree', '--empty'], gitDirectory, directory, signal);
    await git(['update-index', '-z', '--index-info'], gitDirectory, directory, signal, Buffer.from(records));
    const treeSha = revision(decode(await git(['write-tree'], gitDirectory, directory, signal)).trim());
    const baseTree = revision(decode(await git(['rev-parse', `${baseSha}^{tree}`], gitDirectory, directory, signal)).trim());
    const snapshotBaseSha = revision(decode(await git(['commit-tree', baseTree, '-m', `Snapshot of original base ${baseSha}`], gitDirectory, directory, signal)).trim());
    const headSha = revision(decode(await git(['commit-tree', treeSha, '-p', snapshotBaseSha, '-m', `De Vloer candidate ${sessionId}`], gitDirectory, directory, signal)).trim());
    await git(['update-ref', 'refs/heads/vloer-base', snapshotBaseSha], gitDirectory, directory, signal);
    await git(['update-ref', 'refs/heads/vloer-candidate', headSha], gitDirectory, directory, signal);
    await git(['symbolic-ref', 'HEAD', 'refs/heads/vloer-candidate'], gitDirectory, directory, signal);
    const patch = await git(['diff', '--binary', '--full-index', '--no-ext-diff', '--no-textconv', '--no-renames', snapshotBaseSha, headSha, '--'], gitDirectory, directory, signal);
    await git(['bundle', 'create', join(temporary, names.bundle), '--all'], gitDirectory, directory, signal);
    const bundle = await boundedRead(join(temporary, names.bundle), limits.outputBytes);
    const pathsAfter = await git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'], gitDirectory, directory, signal, undefined, sourceIndex);
    if (!excludesBefore.equals(await sourceExcludes(sourceGit)) || !pathsOutput.equals(pathsAfter) || !indexBefore.equals(await boundedRead(sourceIndex, limits.fileBytes)) || headBefore !== await pinCandidateBase(directory)) reject('workspace_changed');
    for (const path of paths) {
      if (!selectedPaths.has(path)) continue;
      const entry = await readWorktreeFile(directory, path); const recorded = current.get(path);
      if (!entry !== !recorded || entry && recorded && (entry.mode !== recorded.mode || createHash('sha1').update(Buffer.from(`blob ${entry.content.length}\0`)).update(entry.content).digest('hex') !== recorded.blob)) reject('workspace_changed');
    }
    const files: CandidateFile[] = [];
    for (const path of paths) {
      const before = base.get(path); const after = current.get(path);
      if (before?.blob === after?.blob && before?.mode === after?.mode) continue;
      files.push({ path, status: !before ? 'added' : !after ? 'deleted' : 'modified', ...(before ? { baseMode: before.mode, baseBlob: before.blob } : {}), ...(after ? { mode: after.mode, blob: after.blob } : {}), bytes: after?.bytes ?? 0 });
    }
    const manifest: CandidateManifest = { version: 1, sessionId, repositoryId: options.repositoryId, createdAt: new Date().toISOString(), baseSha, snapshotBaseSha, headSha, treeSha, history: 'synthetic_snapshot_commits', verification: 'not_performed', publication: 'not_performed', scope: 'base_and_index_tracked_plus_unignored_worktree', files, fileCount: files.length, bytes: bundle.length + patch.length, downloads: { bundle: { filename: names.bundle, bytes: bundle.length, sha256: sha256(bundle) }, patch: { filename: names.patch, bytes: patch.length, sha256: sha256(patch) } } };
    await writeFile(join(temporary, names.patch), patch, { mode: 0o600 });
    await writeFile(join(temporary, names.manifest), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
    await rm(gitDirectory, { recursive: true, force: true });
    await rename(temporary, destination); temporary = undefined;
    return metadata(manifest);
  } catch (error) { return unavailableCandidate(error instanceof CaptureError ? error.reason : 'capture_failed'); }
  finally { if (temporary) await rm(temporary, { recursive: true, force: true }).catch(() => {}); }
}

export async function readCandidate(dataDir: string, sessionId: string, format: CandidateFormat): Promise<{ content: Buffer; contentType: string; filename: string }> {
  if (!Object.hasOwn(names, format)) throw new Error('Unsupported candidate format');
  const root = resolve(dataDir, 'candidates', identity(sessionId));
  const content = await boundedRead(join(root, names[format]), limits.outputBytes);
  if (format !== 'manifest') {
    const manifest = JSON.parse(decode(await boundedRead(join(root, names.manifest)))) as CandidateManifest;
    if (manifest.downloads[format].sha256 !== sha256(content) || manifest.downloads[format].bytes !== content.length) throw new Error('Candidate integrity check failed');
  }
  return { content, contentType: format === 'manifest' ? 'application/json' : format === 'patch' ? 'text/plain; charset=utf-8' : 'application/octet-stream', filename: names[format] };
}

export async function persistRemoteCandidate(dataDir: string, sessionId: string, manifest: CandidateManifest, bundle: Buffer, patch: Buffer): Promise<Candidate> {
  let temporary: string | undefined;
  try {
    identity(sessionId);
    if (manifest.sessionId !== sessionId || manifest.version !== 1 || manifest.verification !== 'not_performed' || manifest.publication !== 'not_performed' || !Array.isArray(manifest.files) || manifest.files.length > limits.files || bundle.length > limits.outputBytes || patch.length > limits.outputBytes || manifest.downloads.bundle.sha256 !== sha256(bundle) || manifest.downloads.patch.sha256 !== sha256(patch) || manifest.downloads.bundle.bytes !== bundle.length || manifest.downloads.patch.bytes !== patch.length) reject('capture_failed');
    revision(manifest.baseSha); revision(manifest.snapshotBaseSha); revision(manifest.headSha); revision(manifest.treeSha);
    for (const file of manifest.files) safePath(file.path);
    const root = resolve(dataDir, 'candidates'); await mkdir(root, { recursive: true, mode: 0o700 });
    try { const existing = JSON.parse(decode(await boundedRead(join(root, sessionId, names.manifest)))) as CandidateManifest; if (existing.sessionId !== sessionId || existing.repositoryId !== manifest.repositoryId || existing.baseSha !== manifest.baseSha) reject('capture_failed'); await readCandidate(dataDir, sessionId, 'bundle'); await readCandidate(dataDir, sessionId, 'patch'); return metadata(existing); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    temporary = await mkdtemp(join(root, `.capture-${sessionId}-`));
    await writeFile(join(temporary, names.bundle), bundle, { mode: 0o600 });
    await writeFile(join(temporary, names.patch), patch, { mode: 0o600 });
    await writeFile(join(temporary, names.manifest), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
    await rename(temporary, join(root, sessionId)); temporary = undefined;
    return metadata(manifest);
  } catch (error) { return unavailableCandidate(error instanceof CaptureError ? error.reason : 'capture_failed'); }
  finally { if (temporary) await rm(temporary, { recursive: true, force: true }).catch(() => {}); }
}
