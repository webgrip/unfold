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

/** Whether git remote `url` (HTTPS, SSH or `host:path`) points at `owner/repo`, ignoring case, a `.git` suffix and a trailing slash. */
export function remoteMatches(url: string | undefined, owner: string, repo: string): boolean {
  if (!url) return false;
  let path = url.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) { try { path = new URL(path).pathname; } catch { return false; } }
  else if (/^[^/]+:/.test(path)) path = path.slice(path.indexOf(':') + 1);
  const parts = decodeURIComponent(path).replace(/\/+$/, '').replace(/\.git$/i, '').split('/').filter(Boolean);
  return parts.length >= 2 && parts.at(-2)!.toLowerCase() === owner.toLowerCase() && parts.at(-1)!.toLowerCase() === repo.toLowerCase();
}

/** The HTTPS clone URL of `owner/repo` on the forge a pull request link points at, or undefined without an HTTPS link. */
export function cloneUrl(pullRequestUrl: string | undefined, owner: string, repo: string): string | undefined {
  try { const url = new URL(pullRequestUrl ?? ''); return url.protocol === 'https:' ? `${url.origin}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}.git` : undefined; }
  catch { return undefined; }
}

/** The open repositories with a remote that points at `owner/repo`, each with the name of that remote. */
export function matchingRepositories(repositories: GitRepository[], owner: string, repo: string): { repository: GitRepository; remote: string }[] {
  return repositories.flatMap(repository => {
    const remotes = repository.state.remotes.filter(remote => remoteMatches(remote.fetchUrl, owner, repo) || remoteMatches(remote.pushUrl, owner, repo));
    const remote = remotes.find(entry => entry.name === 'origin') ?? remotes[0];
    return remote ? [{ repository, remote: remote.name }] : [];
  });
}
