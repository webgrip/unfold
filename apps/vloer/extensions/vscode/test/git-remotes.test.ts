import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneUrl, matchingRepositories, remoteMatches, type GitRepository } from '../src/git-remotes.ts';

test('a remote matches owner/repo over HTTPS, SSH and host:path, ignoring case, .git and a trailing slash', () => {
  for (const url of ['https://forgejo.example/acme/shop.git', 'https://forgejo.example/Acme/Shop', 'https://user@forgejo.example/acme/shop/', 'ssh://git@forgejo.example:2222/acme/shop.git', 'git@forgejo.example:acme/shop.git', 'https://gitlab.example/group/acme/shop.git']) assert.equal(remoteMatches(url, 'acme', 'shop'), true, url);
  for (const url of [undefined, '', 'https://forgejo.example/acme/shop-fork.git', 'https://forgejo.example/other/shop.git', 'https://forgejo.example/shop.git', 'git@forgejo.example:shop.git', '/home/me/acme/shopping']) assert.equal(remoteMatches(url, 'acme', 'shop'), false, String(url));
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
  assert.deepEqual(matchingRepositories([fork, clone, other], 'acme', 'shop').map(match => [match.repository.rootUri.path, match.remote]), [['/src/fork', 'upstream'], ['/src/shop', 'origin']]);
  assert.deepEqual(matchingRepositories([other], 'acme', 'shop'), []);
});
