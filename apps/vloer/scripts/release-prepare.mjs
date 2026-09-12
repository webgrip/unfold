import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('usage: release-prepare.mjs <bare-semver>');
  process.exit(2);
}

function setVersion(file, transform) {
  const path = resolve(root, file);
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  transform(manifest);
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
}

for (const file of ['package.json', 'extensions/vscode/package.json']) setVersion(file, manifest => { manifest.version = version; });
for (const file of ['package-lock.json', 'extensions/vscode/package-lock.json']) setVersion(file, lock => {
  lock.version = version;
  if (lock.packages && lock.packages['']) lock.packages[''].version = version;
});

const extension = resolve(root, 'extensions/vscode');
const output = join(extension, 'dist-release');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const run = (args, cwd) => execFileSync('npm', args, { cwd, stdio: 'inherit', env: { ...process.env, npm_config_fund: 'false', npm_config_audit: 'false' } });
run(['ci', '--no-audit', '--no-fund'], extension);
run(['run', 'compile'], extension);
run(['run', 'package', '--', '--out', join(output, `de-vloer-${version}.vsix`)], extension);
const produced = readdirSync(output).filter(name => name.endsWith('.vsix'));
if (produced.length !== 1) {
  console.error(`expected exactly one VSIX in ${output}, found ${produced.length}`);
  process.exit(1);
}
console.log(JSON.stringify({ version, vsix: join('extensions/vscode/dist-release', produced[0]) }));
