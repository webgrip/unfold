import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const patches = process.argv[2];
const npmCli = realpathSync(execFileSync('sh', ['-c', 'command -v npm'], { encoding: 'utf8' }).trim());
const npmModules = join(dirname(dirname(npmCli)), 'node_modules');
const semver = createRequire(join(npmModules, 'noop.js'))('semver');
const versionOf = directory => JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')).version;

for (const name of readdirSync(patches)) {
  const patched = versionOf(join(patches, name));
  const target = join(npmModules, name);
  if (!existsSync(target)) {
    console.log(`npm no longer bundles ${name}; the ${patched} patch is unused and its pin can go`);
    continue;
  }
  const bundled = versionOf(target);
  if (semver.major(bundled) !== semver.major(patched)) throw new Error(`npm bundles ${name} ${bundled}; the ${patched} patch is another major and would not be a drop-in replacement`);
  if (semver.gte(bundled, patched)) {
    console.log(`npm already bundles ${name} ${bundled} (patch ${patched}); left as shipped, the pin can go`);
    continue;
  }
  rmSync(target, { recursive: true, force: true });
  cpSync(join(patches, name), target, { recursive: true });
  console.log(`replaced npm's bundled ${name} ${bundled} with ${versionOf(target)}`);
}

const fixture = mkdtempSync(join(tmpdir(), 'npm-brace-'));
writeFileSync(join(fixture, 'package.json'), JSON.stringify({ name: 'brace-check', version: '1.0.0', files: ['{a,b}.js'] }));
for (const file of ['a.js', 'b.js', 'c.js']) writeFileSync(join(fixture, file), '');
const report = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: fixture, encoding: 'utf8' }));
const packed = Array.isArray(report) ? report[0] : report['brace-check'];
const included = packed.files.map(file => file.path).sort().join(',');
rmSync(fixture, { recursive: true, force: true });
if (included !== 'a.js,b.js,package.json') throw new Error(`npm expanded {a,b}.js to ${included}; the patched brace-expansion is not working`);
console.log('npm expands brace patterns with the patched dependencies');
