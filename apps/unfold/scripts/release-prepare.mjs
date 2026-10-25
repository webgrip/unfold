import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { applicationRoot as root, releaseVersion, stampVersion } from './stamp-version.mjs';

const version = process.argv[2];
if (!releaseVersion.test(version ?? '')) {
  console.error('usage: release-prepare.mjs <bare-semver>');
  process.exit(2);
}

stampVersion(version);

const releasedAgentImage = /(harbor\.webgrip\.dev\/webgrip\/unfold-agent:)\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?/g;
for (const file of ['ops/cluster/agent-sandbox/warm-pool.yaml', 'ops/local/config.live.example.json']) {
  const path = resolve(root, file);
  const before = readFileSync(path, 'utf8');
  if (before.match(releasedAgentImage) === null) {
    console.error(`${file} must name the released unfold-agent image`);
    process.exit(1);
  }
  writeFileSync(path, before.replace(releasedAgentImage, `$1${version}`));
}

const extension = resolve(root, 'extensions/vscode');
const output = join(extension, 'dist-release');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const run = (args, cwd) => execFileSync('npm', args, { cwd, stdio: 'inherit', env: { ...process.env, npm_config_fund: 'false', npm_config_audit: 'false' } });
run(['ci', '--no-audit', '--no-fund'], extension);
run(['run', 'compile'], extension);
run(['run', 'package', '--', '--out', join(output, `unfold-${version}.vsix`)], extension);
const produced = readdirSync(output).filter(name => name.endsWith('.vsix'));
if (produced.length !== 1) {
  console.error(`expected exactly one VSIX in ${output}, found ${produced.length}`);
  process.exit(1);
}
console.log(JSON.stringify({ version, vsix: join('extensions/vscode/dist-release', produced[0]) }));
