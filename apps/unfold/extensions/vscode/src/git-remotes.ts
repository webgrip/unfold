/** The part of the built-in Git extension's API (`vscode.git`, API version 1) that a checkout uses. */
export type GitRemote = { name: string; fetchUrl?: string; pushUrl?: string };
export type GitBranch = { name?: string; upstream?: { remote: string; name: string }; ahead?: number; behind?: number };
export type GitRepository = {
  rootUri: { path: string; fsPath: string };
  state: { HEAD?: GitBranch; remotes: GitRemote[]; workingTreeChanges: unknown[]; indexChanges: unknown[]; mergeChanges: unknown[] };
  fetch(remote?: string, ref?: string): Promise<void>;
  getBranch(name: string): Promise<GitBranch>;
  checkout(treeish: string): Promise<void>;
  createBranch(name: string, checkout: boolean, ref?: string): Promise<void>;
  setBranchUpstream(name: string, upstream: string): Promise<void>;
  pull(): Promise<void>;
  status(): Promise<void>;
};
export type GitApi = { state: 'uninitialized' | 'initialized'; onDidChangeState(listener: (state: 'uninitialized' | 'initialized') => void): { dispose(): void }; repositories: GitRepository[] };

/** A repository as a forge host (lowercase, no port) and its full path (`group/subgroup/repo`, no `.git` suffix). */
export type RepositoryIdentity = { host: string; path: string };

function identity(host: string, rawPath: string): RepositoryIdentity | undefined {
  const name = host.toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(name) && !/^\[[0-9a-f:.]+\]$/.test(name)) return undefined;
  let parts: string[];
  try { parts = rawPath.split('/').filter(Boolean).map(part => decodeURIComponent(part)); }
  catch { return undefined; }
  if (parts.length) parts[parts.length - 1] = parts[parts.length - 1]!.replace(/\.git$/i, '');
  if (parts.length < 2 || parts.some(part => !part || part === '.' || part === '..' || part.includes('/'))) return undefined;
  return { host: name, path: parts.join('/') };
}

/** The forge host and full repository path of git remote `url` (HTTPS, `ssh://` or SCP-style `[user@]host:path`), or undefined when it is none of those or is malformed. */
export function parseRemote(url: string | undefined): RepositoryIdentity | undefined {
  const value = url?.trim() ?? '';
  if (!value) return undefined;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    let parsed: URL;
    try { parsed = new URL(value); } catch { return undefined; }
    if (!['https:', 'http:', 'ssh:', 'git:', 'git+ssh:', 'ssh+git:'].includes(parsed.protocol) || !parsed.hostname) return undefined;
    return identity(parsed.hostname, parsed.pathname);
  }
  const scp = /^(?:[^@/:]+@)?([^@/:]+):(?!\/\/)(.+)$/.exec(value);
  return scp ? identity(scp[1]!, scp[2]!) : undefined;
}

/** The repository `owner/repo` on the forge that `pullRequestUrl` points at; the host is empty when there is no such link. */
export function expectedRepository(pullRequestUrl: string | undefined, owner: string, repo: string): RepositoryIdentity {
  let host = '';
  try { host = pullRequestUrl ? new URL(pullRequestUrl).hostname.toLowerCase() : ''; } catch { host = ''; }
  return { host, path: [...owner.split('/'), ...repo.split('/')].filter(Boolean).join('/') };
}

/** Remote host to forge host, as the `unfold.remoteHostAliases` setting holds it, for a forge whose SSH host differs from its web host. */
export type HostAliases = Readonly<Record<string, string>>;

const normalHost = (host: string) => host.trim().toLowerCase().replace(/\.$/, '');
const isAddress = (host: string) => /^[0-9.]+$/.test(host) || host.startsWith('[');
const tenantParentDomains = new Set(['ghe.com']);

/** The entries of a `unfold.remoteHostAliases` value that map one host name to another; anything else is dropped. */
export function hostAliases(value: unknown): HostAliases {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const aliases: Record<string, string> = {};
  for (const [from, to] of Object.entries(value)) if (typeof to === 'string' && normalHost(from) && normalHost(to)) aliases[normalHost(from)] = normalHost(to);
  return aliases;
}

/**
 * Whether a remote's host and a forge's host name the same forge: they are equal, `aliases` maps one to the other,
 * or both have at least three labels and share the parent domain left after their first label
 * (`forgejo-ssh.webgrip.dev` and `forgejo.webgrip.dev`). That parent never joins two hosts on GHE.com, where each
 * first label is another enterprise (`octocorp.ghe.com` and `othercorp.ghe.com`).
 */
export function hostsMatch(remoteHost: string, forgeHost: string, aliases: HostAliases = {}): boolean {
  const remote = normalHost(remoteHost);
  const forge = normalHost(forgeHost);
  if (!remote || !forge) return false;
  if (remote === forge) return true;
  const alias = hostAliases(aliases);
  if (alias[remote] === forge || alias[forge] === remote) return true;
  if (isAddress(remote) || isAddress(forge)) return false;
  const remoteLabels = remote.split('.');
  const forgeLabels = forge.split('.');
  const parent = forgeLabels.slice(1).join('.');
  return remoteLabels.length >= 3 && forgeLabels.length >= 3 && remoteLabels.slice(1).join('.') === parent && !tenantParentDomains.has(parent);
}

/**
 * Whether git remote `url` points at `expected`: the same full path, ignoring case, on a matching host (see
 * `hostsMatch`). An expected repository without a host matches its full path on any host.
 */
export function remoteMatches(url: string | undefined, expected: RepositoryIdentity, aliases: HostAliases = {}): boolean {
  const remote = parseRemote(url);
  if (!remote || !expected.path) return false;
  if (expected.host && !hostsMatch(remote.host, expected.host, aliases)) return false;
  return remote.path.toLowerCase() === expected.path.toLowerCase();
}

/** The HTTPS clone URL of `owner/repo` on the forge a pull request link points at, or undefined without an HTTPS link. */
export function cloneUrl(pullRequestUrl: string | undefined, owner: string, repo: string): string | undefined {
  try { const url = new URL(pullRequestUrl ?? ''); return url.protocol === 'https:' ? `${url.origin}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}.git` : undefined; }
  catch { return undefined; }
}

/** The open repositories with a remote that points at `expected`, each with the name of that remote. */
export function matchingRepositories(repositories: GitRepository[], expected: RepositoryIdentity, aliases: HostAliases = {}): { repository: GitRepository; remote: string }[] {
  return repositories.flatMap(repository => {
    const remotes = repository.state.remotes.filter(remote => remoteMatches(remote.fetchUrl, expected, aliases) || remoteMatches(remote.pushUrl, expected, aliases));
    const remote = remotes.find(entry => entry.name === 'origin') ?? remotes[0];
    return remote ? [{ repository, remote: remote.name }] : [];
  });
}
