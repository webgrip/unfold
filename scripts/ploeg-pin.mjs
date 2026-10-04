import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The repository Unfold pins Ploeg from. */
export const PLOEG_URL = 'https://github.com/ploeg-hq/ploeg.git';
/** Where the pinned Ploeg checkout lives inside Unfold. */
export const PLOEG_PATH = 'apps/ploeg';
/** A Ploeg release tag: a stable v0.x.y or a candidate v0.x.y-rc.N. */
export const RELEASE_TAG = /^v0\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-rc\.[1-9][0-9]*)?$/;

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim();

function attempt(read) {
  try { return read(); } catch { return undefined; }
}

/** Reads the commit Unfold pins for Ploeg, or undefined when the path is not a single gitlink. */
export function pinnedCommit(root, path = PLOEG_PATH) {
  const entries = (attempt(() => git(root, ['ls-files', '--stage', '--', path])) ?? '').split('\n').filter(Boolean);
  const gitlink = entries.length === 1 && entries[0].match(/^160000 ([0-9a-f]{40}) 0\t(.+)$/);
  return gitlink && gitlink[2] === path ? gitlink[1] : undefined;
}

/** Reads the Ploeg release tag that `.gitmodules` names for the pin, or undefined when it names none. */
export function pinnedRelease(root, path = PLOEG_PATH) {
  return attempt(() => git(root, ['config', '--file', '.gitmodules', '--get', `submodule.${path}.branch`]));
}

/** Lists what is wrong with the Ploeg pin; an empty list means the pin is an initialised, unmodified gitlink to the canonical repository that names a Ploeg release tag, and when published, that tag's commit. */
export function pinProblems(root, { url = PLOEG_URL, path = PLOEG_PATH, published = false } = {}) {
  const problems = [];
  const entries = (attempt(() => git(root, ['ls-files', '--stage', '--', path])) ?? '').split('\n').filter(Boolean);
  const pin = pinnedCommit(root, path);
  if (!pin) {
    problems.push(entries.length > 1
      ? `${path} tracks ${entries.length} files; Ploeg must be a submodule gitlink (mode 160000), not vendored source`
      : `${path} is not a submodule gitlink (mode 160000)`);
    return problems;
  }
  const declared = attempt(() => git(root, ['config', '--file', '.gitmodules', '--get', `submodule.${path}.url`]));
  if (declared !== url) problems.push(`.gitmodules names ${declared ?? 'no URL'} for ${path}; expected ${url}`);
  const release = pinnedRelease(root, path);
  if (!RELEASE_TAG.test(release ?? '')) problems.push(`.gitmodules names ${release ? `branch ${release}` : 'no release'} for ${path}; expected the Ploeg release tag Unfold pins, such as v0.2.0 or v0.2.0-rc.1`);
  const checkout = resolve(root, path);
  const head = existsSync(resolve(checkout, '.git')) ? attempt(() => git(checkout, ['rev-parse', 'HEAD'])) : undefined;
  if (!head) {
    problems.push(`${path} is not initialised; run git submodule update --init --recursive`);
    return problems;
  }
  if (head !== pin) problems.push(`${path} is checked out at ${head}, but Unfold pins ${pin}; run git submodule update --init --recursive`);
  const dirty = attempt(() => git(checkout, ['status', '--porcelain', '--untracked-files=no']));
  if (dirty) problems.push(`${path} has local changes; change Ploeg upstream and move the pin instead:\n${dirty}`);
  if (published && RELEASE_TAG.test(release ?? '')) {
    const ref = `refs/pin-check/${release}`;
    const fetched = attempt(() => git(checkout, ['fetch', '--quiet', '--no-tags', url, `+refs/tags/${release}:${ref}`]));
    const tagged = fetched === undefined ? undefined : attempt(() => git(checkout, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]));
    if (!tagged) problems.push(`could not fetch the release tag ${release} from ${url}; publish the Ploeg release first, then pin it`);
    else if (tagged !== pin) problems.push(`Unfold pins ${pin}, but Ploeg release ${release} is ${tagged}; pin the release's commit`);
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve(import.meta.dirname, '..');
  const published = process.argv.includes('--published');
  const problems = pinProblems(root, { published });
  if (problems.length) {
    console.error(`Ploeg pin check failed:\n${problems.map(problem => `- ${problem}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`Ploeg pin ${pinnedCommit(root)} from ${PLOEG_URL}${published ? ` is release ${pinnedRelease(root)}` : ''}`);
}
