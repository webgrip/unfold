import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const releaseVersion = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

const asJson = document => JSON.stringify(document, null, 2) + '\n';

function stampManifest(text, version) {
  const manifest = JSON.parse(text);
  manifest.version = version;
  return asJson(manifest);
}

function stampLockfile(text, version) {
  const lockfile = JSON.parse(text);
  lockfile.version = version;
  if (lockfile.packages?.['']) lockfile.packages[''].version = version;
  return asJson(lockfile);
}

function stampChart(text, version) {
  if (!/^version: /m.test(text) || !/^appVersion: /m.test(text)) throw new Error('Chart.yaml must declare version and appVersion');
  return text.replace(/^version:.*$/m, `version: ${version}`).replace(/^appVersion:.*$/m, `appVersion: ${version}`);
}

export const versionSources = {
  app: [['package.json', stampManifest], ['package-lock.json', stampLockfile]],
  extension: [['extensions/vscode/package.json', stampManifest], ['extensions/vscode/package-lock.json', stampLockfile]],
  chart: [['ops/helm/unfold/Chart.yaml', stampChart]],
};

export const applicationRoot = fileURLToPath(new URL('../', import.meta.url));

export function stampVersion(version, { root = applicationRoot, sources = Object.keys(versionSources) } = {}) {
  if (!releaseVersion.test(version ?? '')) throw new Error(`${version} is not a bare semantic version such as 0.4.0-rc.1`);
  const unknown = sources.filter(source => !Object.hasOwn(versionSources, source));
  if (unknown.length) throw new Error(`unknown version source ${unknown.join(', ')}; expected ${Object.keys(versionSources).join(', ')}`);
  const stamped = sources.flatMap(source => versionSources[source]).map(([file, stamp]) => [resolve(root, file), file, stamp]);
  const rewritten = stamped.map(([path, file, stamp]) => {
    const before = readFileSync(path, 'utf8');
    return { path, file, before, after: stamp(before, version) };
  });
  const changed = rewritten.filter(({ before, after }) => before !== after);
  for (const { path, after } of changed) writeFileSync(path, after);
  return changed.map(({ file }) => file);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const [version, ...sources] = process.argv.slice(2);
  try {
    const changed = stampVersion(version, sources.length ? { sources } : {});
    console.log(changed.length ? `Stamped ${version} into ${changed.join(', ')}` : `Every version source already carries ${version}`);
  } catch (error) {
    console.error(`usage: stamp-version.mjs <bare-semver> [${Object.keys(versionSources).join('|')}...]\n${error.message}`);
    process.exit(2);
  }
}
