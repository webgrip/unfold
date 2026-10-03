import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The repository Unfold pins Ploeg from. */
export const PLOEG_URL = 'https://github.com/ploeg-hq/ploeg.git';
/** Where the pinned Ploeg checkout lives inside Unfold. */
export const PLOEG_PATH = 'apps/ploeg';

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

/** Lists what is wrong with the Ploeg pin; an empty list means the pin is an initialised, unmodified gitlink to the canonical repository. */
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
  const checkout = resolve(root, path);
  const head = existsSync(resolve(checkout, '.git')) ? attempt(() => git(checkout, ['rev-parse', 'HEAD'])) : undefined;
  if (!head) {
    problems.push(`${path} is not initialised; run git submodule update --init --recursive`);
    return problems;
  }
  if (head !== pin) problems.push(`${path} is checked out at ${head}, but Unfold pins ${pin}; run git submodule update --init --recursive`);
  const dirty = attempt(() => git(checkout, ['status', '--porcelain', '--untracked-files=no']));
  if (dirty) problems.push(`${path} has local changes; change Ploeg upstream and move the pin instead:\n${dirty}`);
  if (published) {
    const shallow = attempt(() => git(checkout, ['rev-parse', '--is-shallow-repository'])) === 'true';
    const fetched = attempt(() => git(checkout, ['fetch', '--quiet', '--no-tags', ...(shallow ? ['--unshallow'] : []), url, '+refs/heads/main:refs/remotes/pin-check/main']));
    if (fetched === undefined) problems.push(`could not fetch main from ${url}`);
    else if (attempt(() => git(checkout, ['merge-base', '--is-ancestor', pin, 'refs/remotes/pin-check/main'])) === undefined) {
      problems.push(`Unfold pins ${pin}, which is not on ${url} main; land the Ploeg change upstream first, then pin its commit on main`);
    }
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
  console.log(`Ploeg pin ${pinnedCommit(root)} from ${PLOEG_URL}${published ? ' is on main' : ''}`);
}
