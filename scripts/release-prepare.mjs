import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('usage: release-prepare.mjs <bare-semver>');
  process.exit(2);
}

execFileSync('node', [join(root, 'apps/unfold/scripts/release-prepare.mjs'), version], { stdio: 'inherit' });
