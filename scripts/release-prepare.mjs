import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('usage: release-prepare.mjs <bare-semver>');
  process.exit(2);
}

const charts = ['apps/unfold/ops/helm/unfold/Chart.yaml'];

for (const chart of charts) {
  const path = join(root, chart);
  const before = readFileSync(path, 'utf8');
  const after = before
    .replace(/^version:.*$/m, `version: ${version}`)
    .replace(/^appVersion:.*$/m, `appVersion: ${version}`);
  if (!/^version: /m.test(before) || !/^appVersion: /m.test(before)) {
    console.error(`${chart} must declare version and appVersion`);
    process.exit(1);
  }
  writeFileSync(path, after);
}

execFileSync('node', [join(root, 'apps/unfold/scripts/release-prepare.mjs'), version], { stdio: 'inherit' });
