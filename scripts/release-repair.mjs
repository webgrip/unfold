import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/**
 * Builds the Forgejo release that semantic-release would have created for a release commit.
 * @param {string} tag The release tag, for example unfold-v0.4.0-rc.26.
 * @param {string} notes The release commit's body, which holds the generated release notes.
 */
export function releaseFor(tag, notes) {
  return { tag_name: tag, name: tag, body: notes, draft: false, prerelease: /\d+\.\d+\.\d+-/.test(tag) };
}

/**
 * Creates the Forgejo release for the release tag at HEAD when the tag exists but its release does not.
 * Forgejo 15 can answer the release request with HTTP 500 when the tag push it just received
 * inserts the same release row concurrently; the tag and release commit survive, the release does not.
 * @param {{ root: string, prefix: string, api: string, token: string }} options
 * @returns {Promise<string>} What was repaired, or why nothing was.
 */
export async function repairRelease({ root, prefix, api, token }) {
  const tag = git(root, ['tag', '--points-at', 'HEAD', '--list', `${prefix}[0-9]*`]).split('\n').filter(Boolean).at(-1);
  if (!tag) throw new Error(`No ${prefix} tag points at HEAD, so semantic-release failed before tagging; this is not the release race.`);
  const headers = { Authorization: `token ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' };
  const existing = await fetch(`${api}/releases/tags/${encodeURIComponent(tag)}`, { headers });
  if (existing.ok) throw new Error(`${tag} already has a release, so the failure was not the release race.`);
  if (existing.status !== 404) throw new Error(`Looking up the ${tag} release answered HTTP ${existing.status}.`);
  const created = await fetch(`${api}/releases`, { method: 'POST', headers, body: JSON.stringify(releaseFor(tag, git(root, ['log', '-1', '--format=%b', tag]))) });
  if (!created.ok) throw new Error(`Creating the ${tag} release answered HTTP ${created.status}: ${await created.text()}`);
  return `Created the missing ${tag} release; its publication workflow starts from that release.`;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  const [prefix] = process.argv.slice(2);
  const { RELEASE_API: api, GITEA_TOKEN: token } = process.env;
  if (!prefix || !api || !token) {
    console.error('Usage: RELEASE_API=<repository API URL> GITEA_TOKEN=<token> node scripts/release-repair.mjs <tag prefix>');
    process.exit(2);
  }
  try {
    console.log(await repairRelease({ root: process.cwd(), prefix, api, token }));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
