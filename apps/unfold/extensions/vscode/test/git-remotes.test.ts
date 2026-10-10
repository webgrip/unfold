import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneUrl, expectedRepository, hostAliases, hostsMatch, matchingRepositories, parseRemote, parseWorktrees, remoteMatches, type GitRepository } from '../src/git-remotes.ts';

test('a remote parses to its forge host and full repository path over HTTPS, ssh:// and SCP-style', () => {
  const cases: [string, { host: string; path: string } | undefined][] = [
    ['https://forgejo.example/acme/shop.git', { host: 'forgejo.example', path: 'acme/shop' }],
    ['https://user@Forgejo.Example:8443/Acme/Shop/', { host: 'forgejo.example', path: 'Acme/Shop' }],
    ['ssh://git@forgejo.example:2222/acme/shop.git', { host: 'forgejo.example', path: 'acme/shop' }],
    ['ssh://git@forgejo.example/acme/shop', { host: 'forgejo.example', path: 'acme/shop' }],
    ['git@forgejo.example:acme/shop.git', { host: 'forgejo.example', path: 'acme/shop' }],
    ['forgejo.example:acme/shop', { host: 'forgejo.example', path: 'acme/shop' }],
    ['https://gitlab.example/group/sub/shop.git', { host: 'gitlab.example', path: 'group/sub/shop' }],
    ['git@gitlab.example:group/sub/shop.git', { host: 'gitlab.example', path: 'group/sub/shop' }],
    ['https://forgejo.example/acme/my%20shop.git', { host: 'forgejo.example', path: 'acme/my shop' }],
    [' https://forgejo.example/acme/shop.git ', { host: 'forgejo.example', path: 'acme/shop' }],
  ];
  for (const [url, expected] of cases) assert.deepEqual(parseRemote(url), expected, url);
  for (const url of [undefined, '', '   ', '/home/me/acme/shop', 'file:///home/me/acme/shop.git', 'https://forgejo.example/shop.git', 'git@forgejo.example:shop.git', 'https://forgejo.example/acme/%E0%A4%A.git', 'https://forgejo.example/acme/%2F/shop.git', 'git@forgejo.example:acme/%zz.git', 'https://[bad/acme/shop.git', 'https://forgejo.example/acme/%2E%2E/shop.git', 'C:\\src\\shop']) assert.equal(parseRemote(url), undefined, String(url));
});

test('a remote matches the expected forge host and full path, ignoring case, .git and a trailing slash', () => {
  const shop = { host: 'forgejo.example', path: 'acme/shop' };
  for (const url of ['https://forgejo.example/acme/shop.git', 'https://forgejo.example/Acme/Shop', 'https://user@forgejo.example/acme/shop/', 'ssh://git@forgejo.example:2222/acme/shop.git', 'git@forgejo.example:acme/shop.git', 'git@FORGEJO.example:acme/shop.git']) assert.equal(remoteMatches(url, shop), true, url);
  for (const url of [undefined, '', 'https://forgejo.example/acme/shop-fork.git', 'https://forgejo.example/other/shop.git', 'https://forgejo.example/shop.git', 'git@forgejo.example:shop.git', '/home/me/acme/shopping', 'https://forgejo.example/group/acme/shop.git', 'https://github.com/acme/shop.git', 'git@gitlab.example:acme/shop.git', 'https://forgejo.example/acme/%E0%A4%A.git']) assert.equal(remoteMatches(url, shop), false, String(url));
});

test('a nested GitLab group is matched by its full path, not its last two parts', () => {
  const nested = expectedRepository('https://gitlab.example/group/sub/shop/-/merge_requests/4', 'group/sub', 'shop');
  assert.deepEqual(nested, { host: 'gitlab.example', path: 'group/sub/shop' });
  assert.equal(remoteMatches('git@gitlab.example:group/sub/shop.git', nested), true);
  assert.equal(remoteMatches('git@gitlab.example:sub/shop.git', nested), false);
  assert.equal(remoteMatches('git@gitlab.example:other/sub/shop.git', nested), false);
});

test('the expected repository takes its host from the pull request link, and has none without a valid link', () => {
  assert.deepEqual(expectedRepository('https://Forgejo.Example:3000/acme/shop/pulls/9', 'acme', 'shop'), { host: 'forgejo.example', path: 'acme/shop' });
  assert.deepEqual(expectedRepository(undefined, 'acme', 'shop'), { host: '', path: 'acme/shop' });
  assert.deepEqual(expectedRepository('not a url', 'acme', 'shop'), { host: '', path: 'acme/shop' });
  const anyHost = expectedRepository(undefined, 'acme', 'shop');
  assert.equal(remoteMatches('https://github.com/acme/shop.git', anyHost), true);
  assert.equal(remoteMatches('https://github.com/group/acme/shop.git', anyHost), false);
});

test('an SSH host under the same parent domain as the forge matches without a setting', () => {
  const unfold = expectedRepository('https://forgejo.webgrip.dev/webgrip/unfold/pulls/12', 'webgrip', 'unfold');
  assert.equal(remoteMatches('ssh://git@forgejo-ssh.webgrip.dev/webgrip/unfold.git', unfold), true);
  assert.equal(remoteMatches('https://github.com/webgrip/unfold.git', unfold), false);
  assert.equal(remoteMatches('ssh://git@forgejo-ssh.webgrip.dev/webgrip/other.git', unfold), false);
  assert.equal(hostsMatch('forgejo-ssh.webgrip.dev', 'forgejo.webgrip.dev'), true);
  for (const [remote, forge] of [['github.com', 'forgejo.webgrip.dev'], ['gitlab.com', 'github.com'], ['webgrip.dev', 'forgejo.webgrip.dev'], ['forgejo.webgrip.dev', 'forgejo.other.dev'], ['10.0.0.5', '11.0.0.5']]) assert.equal(hostsMatch(remote!, forge!), false, `${remote} ~ ${forge}`);
});

test('a GHE.com enterprise matches its own clones over HTTPS and SSH, never another enterprise on GHE.com', () => {
  const shop = expectedRepository('https://octocorp.ghe.com/acme/shop/pull/7', 'acme', 'shop');
  assert.deepEqual(shop, { host: 'octocorp.ghe.com', path: 'acme/shop' });
  for (const url of ['https://octocorp.ghe.com/acme/shop.git', 'octocorp@octocorp.ghe.com:acme/shop.git', 'ssh://octocorp@octocorp.ghe.com/acme/shop.git']) assert.equal(remoteMatches(url, shop), true, url);
  for (const url of ['https://othercorp.ghe.com/acme/shop.git', 'othercorp@othercorp.ghe.com:acme/shop.git', 'https://github.com/acme/shop.git', 'https://api.octocorp.ghe.com/acme/shop.git', 'https://ghe.com/acme/shop.git']) assert.equal(remoteMatches(url, shop), false, url);
  assert.equal(hostsMatch('othercorp.ghe.com', 'octocorp.ghe.com'), false);
  assert.equal(hostsMatch('OctoCorp.GHE.com.', 'octocorp.ghe.com'), true);
  assert.equal(hostsMatch('ssh.example.net', 'octocorp.ghe.com', hostAliases({ 'ssh.example.net': 'octocorp.ghe.com' })), true);
  assert.equal(cloneUrl('https://octocorp.ghe.com/acme/shop/pull/7', 'acme', 'shop'), 'https://octocorp.ghe.com/acme/shop.git');
});

test('a host mapped by unfold.remoteHostAliases matches the forge it names, in either direction', () => {
  const shop = expectedRepository('https://git.example.com/acme/shop/pulls/3', 'acme', 'shop');
  const aliases = hostAliases({ 'SSH.Example.NET': 'git.example.com', broken: 7, '': 'x' });
  assert.deepEqual(aliases, { 'ssh.example.net': 'git.example.com' });
  assert.equal(remoteMatches('git@ssh.example.net:acme/shop.git', shop), false);
  assert.equal(remoteMatches('git@ssh.example.net:acme/shop.git', shop, aliases), true);
  assert.equal(hostsMatch('git.example.com', 'ssh.example.net', aliases), true);
  assert.equal(remoteMatches('git@github.com:acme/shop.git', shop, aliases), false);
  assert.deepEqual(hostAliases(undefined), {});
  assert.deepEqual(hostAliases(['a']), {});
});

test('the clone URL comes from the forge of an HTTPS pull request link, never from anything else', () => {
  assert.equal(cloneUrl('https://forgejo.example/acme/shop/pulls/9', 'acme', 'shop'), 'https://forgejo.example/acme/shop.git');
  assert.equal(cloneUrl('http://forgejo.example/acme/shop/pulls/9', 'acme', 'shop'), undefined);
  assert.equal(cloneUrl(undefined, 'acme', 'shop'), undefined);
  assert.equal(cloneUrl('not a url', 'acme', 'shop'), undefined);
});

test('only open clones of the target repository are offered, through origin when it is one of the matching remotes', () => {
  const repository = (path: string, remotes: { name: string; fetchUrl?: string; pushUrl?: string }[]) => ({ rootUri: { path, fsPath: path }, state: { remotes, workingTreeChanges: [], indexChanges: [], mergeChanges: [] } }) as unknown as GitRepository;
  const fork = repository('/src/fork', [{ name: 'mine', fetchUrl: 'git@forge:me/shop.git' }, { name: 'upstream', fetchUrl: 'https://forge/acme/shop.git' }]);
  const clone = repository('/src/shop', [{ name: 'forge', pushUrl: 'https://forge/acme/shop.git' }, { name: 'origin', fetchUrl: 'git@forge:acme/shop.git' }]);
  const other = repository('/src/blog', [{ name: 'origin', fetchUrl: 'https://forge/acme/blog.git' }]);
  const shop = { host: 'forge', path: 'acme/shop' };
  assert.deepEqual(matchingRepositories([fork, clone, other], shop).map(match => [match.repository.rootUri.path, match.remote]), [['/src/fork', 'upstream'], ['/src/shop', 'origin']]);
  assert.deepEqual(matchingRepositories([other], shop), []);
});

test('a clone of the same owner/repo on another forge is not offered', () => {
  const repository = (path: string, remotes: { name: string; fetchUrl?: string; pushUrl?: string }[]) => ({ rootUri: { path, fsPath: path }, state: { remotes, workingTreeChanges: [], indexChanges: [], mergeChanges: [] } }) as unknown as GitRepository;
  const elsewhere = repository('/src/github-shop', [{ name: 'origin', fetchUrl: 'git@github.com:acme/shop.git' }]);
  const broken = repository('/src/broken', [{ name: 'origin', fetchUrl: 'https://forge.example/acme/%E0%A4%A' }]);
  const ours = repository('/src/shop', [{ name: 'origin', fetchUrl: 'ssh://git@forge.example:2222/acme/shop.git' }]);
  assert.deepEqual(matchingRepositories([elsewhere, broken, ours], { host: 'forge.example', path: 'acme/shop' }).map(match => match.repository.rootUri.path), ['/src/shop']);
});

test('worktrees parse from porcelain output with the local branch each has checked out', () => {
  const output = 'worktree /src/shop\nHEAD aaaa\nbranch refs/heads/main\n\nworktree /src/shop-agent-vik-50\nHEAD bbbb\nbranch refs/heads/agent/vik-50\n\nworktree /src/shop-detached\nHEAD cccc\ndetached\n\n';
  assert.deepEqual(parseWorktrees(output), [{ path: '/src/shop', branch: 'main' }, { path: '/src/shop-agent-vik-50', branch: 'agent/vik-50' }, { path: '/src/shop-detached' }]);
  assert.deepEqual(parseWorktrees(''), []);
});
